import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = path.join(root, 'apps/web/src/app/api');
const outRoot = path.join(root, 'packages/portal-services/src/handlers');

const SKIP_PREFIXES = ['security/'];

function shouldSkip(rel) {
  if (SKIP_PREFIXES.some((p) => rel.startsWith(p))) return true;
  if (rel.includes('[...')) return true;
  return false;
}

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full, rel));
      continue;
    }
    if (entry.name === 'route.ts') {
      files.push({ full, rel: rel.replace(/\\/g, '/').replace(/\/route\.ts$/, '') });
    }
  }
  return files;
}

function toPattern(rel) {
  const parts = rel.split('/');
  if (!parts.length) return '/';
  return (
    '/' +
    parts
      .map((p) => {
        if (p.startsWith('[...') && p.endsWith(']')) return `:${p.slice(4, -1)}*`;
        if (p.startsWith('[') && p.endsWith(']')) return `:${p.slice(1, -1)}`;
        return p;
      })
      .join('/')
  );
}

function safeName(rel) {
  const parts = rel.split('/');
  if (parts.length === 1) return parts[0].replace(/[[\].]/g, '') || 'root';
  return parts.slice(1).join('__').replace(/[[\].]/g, '') || 'root';
}

function dispatchId(domain, name) {
  return `${domain}_${name}`.replace(/-/g, '_');
}

function findMatchingParen(str, openIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = openIndex; i < str.length; i++) {
    const c = str[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingBrace(str, openIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = openIndex; i < str.length; i++) {
    const c = str[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelComma(args) {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (inString) {
      if (c === '\\') {
        i++;
        continue;
      }
      if (c === stringChar) inString = false;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = true;
      stringChar = c;
      continue;
    }
    if (c === '(' || c === '{' || c === '[') depth++;
    else if (c === ')' || c === '}' || c === ']') depth--;
    else if (c === ',' && depth === 0) return [args.slice(0, i).trim(), args.slice(i + 1).trim()];
  }
  return [args.trim(), ''];
}

function parseOptionsObject(optionsStr) {
  const result = { status: 200, headers: null };
  if (!optionsStr) return result;
  const statusMatch = optionsStr.match(/status:\s*(\d+)/);
  if (statusMatch) result.status = Number(statusMatch[1]);
  const headersIdx = optionsStr.indexOf('headers:');
  if (headersIdx !== -1) {
    const braceStart = optionsStr.indexOf('{', headersIdx);
    if (braceStart !== -1) {
      const braceEnd = findMatchingBrace(optionsStr, braceStart);
      if (braceEnd !== -1) {
        result.headers = optionsStr.slice(braceStart, braceEnd + 1);
      }
    }
  }
  return result;
}

function replaceNextResponseJson(src) {
  const needle = 'NextResponse.json(';
  let result = '';
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf(needle, i);
    if (idx === -1) {
      result += src.slice(i);
      break;
    }
    result += src.slice(i, idx);
    const openParen = idx + needle.length - 1;
    const closeParen = findMatchingParen(src, openParen);
    if (closeParen === -1) {
      result += src.slice(idx);
      break;
    }
    const args = src.slice(openParen + 1, closeParen);
    const [bodyArg, optionsArg] = splitTopLevelComma(args);
    const opts = parseOptionsObject(optionsArg);
    const headerPart = opts.headers ? `, headers: ${opts.headers}` : '';
    result += `{ status: ${opts.status}, body: ${bodyArg}${headerPart} }`;
    i = closeParen + 1;
  }
  return result;
}

function replaceNewNextResponse(src) {
  const needle = 'new NextResponse(';
  let result = '';
  let i = 0;
  while (i < src.length) {
    const idx = src.indexOf(needle, i);
    if (idx === -1) {
      result += src.slice(i);
      break;
    }
    result += src.slice(i, idx);
    const openParen = idx + needle.length - 1;
    const closeParen = findMatchingParen(src, openParen);
    if (closeParen === -1) {
      result += src.slice(idx);
      break;
    }
    const args = src.slice(openParen + 1, closeParen);
    const [bodyArg, optionsArg] = splitTopLevelComma(args);
    const opts = parseOptionsObject(optionsArg);
    const headerPart = opts.headers ? `, headers: ${opts.headers}` : '';
    result += `{ status: ${opts.status}, rawBody: ${bodyArg}${headerPart} }`;
    i = closeParen + 1;
  }
  return result;
}

function stripModuleImports(src, modulePath) {
  const re = new RegExp(
    `import\\s+(?:type\\s+)?(?:\\{[\\s\\S]*?\\}|\\*\\s+as\\s+\\w+|[\\w$]+)\\s+from\\s+['"]${modulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"];?\\s*`,
    'g'
  );
  return src.replace(re, '');
}

function extractImports(content) {
  const imports = [];
  const re = /import\s+(?:type\s+)?[\s\S]*?from\s+['"][^'"]+['"];?/g;
  let match;
  while ((match = re.exec(content)) !== null) {
    const statement = match[0];
    if (
      statement.includes('next/server') ||
      statement.includes('@/lib/auth') ||
      statement.includes('@web/lib/auth') ||
      statement.includes('@/lib/with-security') ||
      statement.includes('@web/lib/with-security') ||
      statement.includes('@/lib/msp-auth') ||
      statement.includes('@web/lib/msp-auth') ||
      statement.includes('@/lib/mini-api-guard') ||
      statement.includes('@web/lib/mini-api-guard')
    ) {
      continue;
    }
    imports.push(statement.replace(/@\/lib\//g, '@web/lib/').trim());
  }
  return imports;
}

function transform(content) {
  const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) =>
    new RegExp(`export async function ${m}\\b`).test(content)
  );

  const header = `// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';
`;

  let bodySrc = content;
  bodySrc = stripModuleImports(bodySrc, '@/lib/auth');
  bodySrc = stripModuleImports(bodySrc, '@web/lib/auth');
  bodySrc = stripModuleImports(bodySrc, '@/lib/with-security');
  bodySrc = stripModuleImports(bodySrc, '@web/lib/with-security');
  bodySrc = stripModuleImports(bodySrc, '@/lib/msp-auth');
  bodySrc = stripModuleImports(bodySrc, '@web/lib/msp-auth');
  bodySrc = stripModuleImports(bodySrc, 'next/server');
  bodySrc = bodySrc.replace(/from '@\/lib\//g, "from '@web/lib/");
  bodySrc = bodySrc.replace(/from "@\/lib\//g, 'from "@web/lib/');
  bodySrc = bodySrc.replace(/from '@web\/lib\/jwt'/g, "from '@cd-v2/api-handlers'");

  const importLines = extractImports(content);
  let imports = [...new Set(importLines)].join('\n');
  imports = imports.replace(
    /import \{([^}]*),\s*signToken,\s*COOKIE_NAME([^}]*)\} from '@cd-v2\/api-handlers';/g,
    "import {$1$2} from '@cd-v2/api-handlers';"
  );
  imports = imports.replace(/import \{ signToken, COOKIE_NAME \} from '@cd-v2\/api-handlers';\n?/g, '');

  const needsHttpHelpers =
    content.includes('with-security') ||
    content.includes('applyRequestGuard') ||
    content.includes('getClientIp') ||
    content.includes('getRequestHost');
  if (needsHttpHelpers) {
    imports += `\nimport { applyRequestGuardFromCtx, getClientIpFromCtx, getRequestHostFromCtx } from '../../http-helpers';`;
  }
  if (content.includes('guardMiniApiRoute') || content.includes('mini-api-guard')) {
    imports += `\nimport { guardMiniApiRouteResult } from '../../mini-helpers';`;
  }

  const handlers = [];
  for (const method of methods) {
    const fnRe = new RegExp(`export async function ${method}\\([\\s\\S]*?\\n\\}`, 'm');
    const match = content.match(fnRe);
    if (!match) continue;

    let body = match[0];
    body = body.replace(`export async function ${method}`, `export async function ${method}Handler`);
    body = body.replace(/\([^)]*\)\s*\{/, '(ctx: ApiContext): Promise<ApiResult> {');
    body = replaceNewNextResponse(replaceNextResponseJson(body));
    body = body.replace(/return NextResponse\.json/g, 'return { status: 200, body:');
    body = body.replace(/requireSession\(ctx\)\.NextRequest\)/g, 'requireSession(ctx)');
    body = body.replace(/requireSession\(req as import\([^)]+\)\.NextRequest\)/g, 'requireSession(ctx)');
    body = body.replace(/requireSession\(req\)/g, 'requireSession(ctx)');
    body = body.replace(/requireAdmin\(req\)/g, 'requireAdmin(ctx)');
    body = body.replace(/requireBackupAdmin\(req[^)]*\)/g, 'requireBackupAdmin(ctx)');
    body = body.replace(/requireMspApiAuth\(req[^)]*\)/g, 'requireMspApiAuth(ctx)');
    body = body.replace(/const \{ searchParams \} = req\.nextUrl/g, 'const searchParams = searchParamsFrom(ctx)');
    body = body.replace(/await req\.json\(\)\.catch\(\(\) => \(\{\}\)\)/g, '(ctx.body ?? {}) as Record<string, unknown>');
    body = body.replace(/await req\.json\(\)/g, 'ctx.body as Record<string, unknown>');
    body = body.replace(/await req\.formData\(\)/g, 'await getFormDataFromCtx(ctx)');
    body = body.replace(/req\.nextUrl\.searchParams/g, 'searchParamsFrom(ctx)');
    body = body.replace(/req\.headers\.get\(/g, 'ctx.header(');
    body = body.replace(/getClientIp\(req\)/g, 'getClientIpFromCtx(ctx)');
    body = body.replace(/getRequestHost\(req\)/g, 'getRequestHostFromCtx(ctx)');
    body = body.replace(/getRequestPublicOrigin\(req\)/g, 'getRequestPublicOriginFromCtx(ctx)');
    body = body.replace(/applyRequestGuard\(req\)/g, 'applyRequestGuardFromCtx(ctx)');
    body = body.replace(/await guardMiniApiRoute\(\)/g, 'await guardMiniApiRouteResult()');
    body = body.replace(/const \{ params \} = await context/g, 'const params = ctx');
    body = body.replace(/const \{ id \} = await params/g, 'const { id } = ctx.params');
    body = body.replace(/const \{ ([^}]+) \} = await params/g, 'const { $1 } = ctx.params');
    body = body.replace(/authErrorResponse\(error\)/g, 'authErrorResult(error)');
    body = body.replace(/authErrorResponse\(e\)/g, 'authErrorResult(e)');
    body = body.replace(/mspAuthErrorResponse\(error\)/g, 'mspAuthErrorResult(error)');
    body = body.replace(/mspAuthErrorResponse\(e\)/g, 'mspAuthErrorResult(e)');
    body = body.replace(/return \{ status: 200, body: result\.body \};/g, 'return { status: result.status, body: result.body };');
    body = body.replace(
      /const res = \{ status: 200, body: ([\s\S]*?) \};\s*res\.cookies\.set\(COOKIE_NAME, token, \{[\s\S]*?\}\);\s*return res;/g,
      "return { status: 200, body: $1, cookies: [{ name: COOKIE_NAME, value: token, httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 }] };"
    );
    body = body.replace(
      /const res = \{ status: (\d+), body: ([\s\S]*?) \};\s*res\.cookies\.set\(COOKIE_NAME, '', \{[\s\S]*?\}\);\s*return res;/g,
      "return { status: $1, body: $2, cookies: [{ name: COOKIE_NAME, value: '', httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 }] };"
    );

    handlers.push(body);
  }

  const helperFns = content.match(/async function logLoginAttempt[\s\S]*?\n\}/);
  const needsFormData = content.includes('formData');
  const needsBackupApi = content.includes('requireBackupAdmin') || content.includes('requireCls1ForFullRestore');
  const needsSiteUrl = content.includes('getRequestPublicOrigin');

  let extraImports = '';
  if (needsBackupApi) {
    extraImports += `\nimport { requireBackupAdmin, requireCls1ForFullRestore } from '../../backup-helpers';`;
  }
  if (needsSiteUrl) {
    extraImports += `\nimport { getRequestPublicOriginFromCtx } from '../../http-helpers';`;
  }

  const helpers = `
${helperFns ? helperFns[0] : ''}
function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}
${needsFormData ? `
async function getFormDataFromCtx(ctx: ApiContext): Promise<FormData> {
  if (ctx.formData) return ctx.formData;
  throw new Error('Multipart form data not available');
}
` : ''}
`;

  const dispatch = `
export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
${methods.map((m) => `    if (method === '${m}') return ${m}Handler(ctx);`).join('\n')}
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
`;

  return `${header}
${imports}${extraImports}
${helpers}
${handlers.join('\n\n')}
${dispatch}
`;
}

// Clean output directory before regenerating
if (fs.existsSync(outRoot)) {
  fs.rmSync(outRoot, { recursive: true, force: true });
}

const files = walk(apiRoot).filter((f) => !shouldSkip(f.rel));
const byDomain = {};

for (const file of files) {
  const domain = file.rel.split('/')[0];
  if (!byDomain[domain]) byDomain[domain] = [];
  const content = fs.readFileSync(file.full, 'utf8');
  const name = safeName(file.rel);
  const outDir = path.join(outRoot, domain);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${name}.ts`), transform(content));
  byDomain[domain].push({ name, pattern: toPattern(file.rel), rel: file.rel });
}

const registryDir = path.join(root, 'packages/portal-services/src');
const imports = [];
const routes = [];

for (const [domain, items] of Object.entries(byDomain).sort()) {
  for (const item of items.sort((a, b) => a.pattern.localeCompare(b.pattern))) {
    const id = dispatchId(domain, item.name);
    imports.push(`import { dispatch as dispatch_${id} } from './handlers/${domain}/${item.name}';`);
    const content = fs.readFileSync(path.join(outRoot, domain, `${item.name}.ts`), 'utf8');
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      if (!new RegExp(`export async function ${method}Handler`).test(content)) continue;
      routes.push(`  { method: '${method}', pattern: '${item.pattern}', handler: dispatch_${id} },`);
    }
  }
}

const registry = `${imports.join('\n')}
import { createDispatcher, type RouteEntry } from '@cd-v2/api-handlers';
import { dispatch as dispatch_mini_library__path } from './handlers/mini/library__path';
import { dispatch as dispatch_mini_project_guard__path } from './handlers/mini/project_guard__path';

export const portalRoutes: RouteEntry[] = [
${routes.join('\n')}
  { method: 'GET', pattern: '/mini/library/:path*', handler: dispatch_mini_library__path },
  { method: 'POST', pattern: '/mini/library/:path*', handler: dispatch_mini_library__path },
  { method: 'GET', pattern: '/mini/external-systems/project-guard/:path*', handler: dispatch_mini_project_guard__path },
  { method: 'POST', pattern: '/mini/external-systems/project-guard/:path*', handler: dispatch_mini_project_guard__path },
];

export const dispatchAll = createDispatcher(portalRoutes);

export const domainNames = ${JSON.stringify(Object.keys(byDomain).sort())} as const;
`;

fs.writeFileSync(path.join(registryDir, 'registry.ts'), registry);
console.log(`Ported ${files.length} routes across ${Object.keys(byDomain).length} domains`);

const catchAllHandlers = {
  'mini/library__path.ts': `import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { miniProxyRequest } from '@web/lib/mini-dock';
import { guardMiniApiRouteResult } from '../../mini-helpers';

async function proxyLibrary(ctx: ApiContext, method: 'GET' | 'POST'): Promise<ApiResult> {
  requireSession(ctx);
  const guard = await guardMiniApiRouteResult();
  if (guard) return guard;

  const segments = (ctx.params.path || '').split('/').filter(Boolean);
  const target = \`/api/library/\${segments.join('/')}\`;
  const init: RequestInit = { method };

  if (method === 'POST') {
    init.body = JSON.stringify(ctx.body ?? {});
  }

  const result = await miniProxyRequest(target, init);
  return { status: result.status, body: result.body };
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return proxyLibrary(ctx, 'GET');
    if (method === 'POST') return proxyLibrary(ctx, 'POST');
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
`,
  'mini/project_guard__path.ts': `import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { MINI_PROJECT_GUARD_PROXY_TIMEOUT_MS, miniProxyRequest } from '@web/lib/mini-dock';
import { guardMiniApiRouteResult } from '../../mini-helpers';

async function proxyProjectGuard(ctx: ApiContext, method: 'GET' | 'POST'): Promise<ApiResult> {
  requireSession(ctx);
  const guard = await guardMiniApiRouteResult();
  if (guard) return guard;

  const segments = (ctx.params.path || '').split('/').filter(Boolean);
  const target = \`/api/external-systems/project-guard/\${segments.join('/')}\`;
  const init: RequestInit = { method };

  if (method === 'POST') {
    init.body = JSON.stringify(ctx.body ?? {});
  }

  const result = await miniProxyRequest(target, init, {
    timeoutMs: MINI_PROJECT_GUARD_PROXY_TIMEOUT_MS,
    updateOnlineCache: false,
  });
  return { status: result.status, body: result.body };
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return proxyProjectGuard(ctx, 'GET');
    if (method === 'POST') return proxyProjectGuard(ctx, 'POST');
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
`,
};

for (const [rel, source] of Object.entries(catchAllHandlers)) {
  const outFile = path.join(outRoot, rel);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, source);
}
