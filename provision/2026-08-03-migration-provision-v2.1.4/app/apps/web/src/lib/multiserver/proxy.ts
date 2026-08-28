import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import type { DemoEntry, DemoManifest } from '@/lib/multiserver/manifest';
import { demoUiPrefix } from '@/lib/multiserver/manifest';

const DEMO_HOST = '127.0.0.1';

function stripDemoPrefix(pathname: string, uiPrefix: string): string {
  if (pathname === uiPrefix) return '/';
  if (pathname.startsWith(`${uiPrefix}/`)) {
    const rest = pathname.slice(uiPrefix.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

function rewriteLocationHeader(location: string, uiPrefix: string): string {
  if (
    location.startsWith('http://') ||
    location.startsWith('https://') ||
    location.startsWith(uiPrefix)
  ) {
    return location;
  }
  if (location.startsWith('/')) {
    if (location === '/') return `${uiPrefix}/`;
    return `${uiPrefix}${location}`;
  }
  return location;
}

function rewriteDemoHtmlAssets(html: string, uiPrefix: string): string {
  if (!html.includes('<html')) return html;
  const baseHref = `${uiPrefix.replace(/\/$/, '')}/`;
  let out = html.replace(
    /<!-- multiserver-demo-patch -->[\s\S]*?<\/script>\s*/gi,
    '<!-- multiserver-demo-patch: path-prefixed assets -->\n'
  );

  // CRA / webpack apps use root-absolute /static/* — <base> fixes all of them at once.
  if (/<base\s/i.test(out)) {
    out = out.replace(/<base\s[^>]*>/i, `<base href="${baseHref}">`);
  } else {
    out = out.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${baseHref}">`);
  }

  // Vite builds: /index.* or ./index.*
  out = out.replace(
    /(\s(?:src|href)=["'])\/(index\.[^"']+)["']/gi,
    `$1${uiPrefix}/$2"`
  );
  out = out.replace(
    /(\s(?:src|href)=["'])\.\/(index\.[^"']+)["']/gi,
    `$1${uiPrefix}/$2"`
  );
  out = out.replace(/(\shref=["'])\/vite\.svg["']/gi, `$1${uiPrefix}/vite.svg"`);
  out = out.replace(/(\shref=["'])\.\/vite\.svg["']/gi, `$1${uiPrefix}/vite.svg"`);

  // Common CRA entry assets (backup if <base> is ignored)
  out = out.replace(
    /(\s(?:src|href)=["'])\/(static\/[^"']+)["']/gi,
    `$1${uiPrefix}/$2"`
  );
  out = out.replace(
    /(\s(?:src|href)=["'])\/(favicon\.ico|manifest\.json|logo\d+\.png|robots\.txt)["']/gi,
    `$1${uiPrefix}/$2"`
  );

  // CRA axios/fetch use root-absolute "/api" (ignores <base>). Prefix API calls for this demo path.
  const prefix = uiPrefix.replace(/\/$/, '');
  const apiShim = `<script id="multiserver-api-shim">(function(){var p=${JSON.stringify(prefix)};function prefixApi(x){if(typeof x!=="string")return x;if(x.startsWith("/api"))return p+x;try{var n=new URL(x,location.origin);if(n.pathname.startsWith("/api")&&!n.pathname.startsWith(p+"/api"))return p+n.pathname+n.search+n.hash;}catch(e){}return x;}var f=window.fetch;if(f)window.fetch=function(i,o){if(typeof i==="string")i=prefixApi(i);else if(i&&typeof i==="object"&&"url"in i&&i.url)i=new Request(prefixApi(String(i.url)),i);return f.call(this,i,o)};var xo=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,url){var a=Array.prototype.slice.call(arguments,2);return xo.apply(this,[m,prefixApi(url)].concat(a))};})();</script>`;
  out = out.replace(/<head([^>]*)>/i, `<head$1>\n${apiShim}`);

  return out;
}

function relaxDemoCsp(headers: Headers): void {
  const csp = headers.get('content-security-policy');
  if (!csp || csp.includes('static.cloudflareinsights.com')) return;
  headers.set(
    'content-security-policy',
    csp
      .replace(/script-src ([^;]+)/, 'script-src $1 https://static.cloudflareinsights.com')
      .replace(/connect-src ([^;]+)/, 'connect-src $1 https://cloudflareinsights.com')
  );
}

function hopByHopHeaders(): Set<string> {
  return new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailers',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length',
  ]);
}

function buildTargetUrl(port: number, targetPath: string, search: string): string {
  const pathPart = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  return `http://${DEMO_HOST}:${port}${pathPart}${search}`;
}

export async function proxyDemoRequest(
  request: NextRequest,
  manifest: DemoManifest,
  demo: DemoEntry,
  slug: string
): Promise<NextResponse> {
  const uiPrefix = demoUiPrefix(manifest, slug);
  const pathname = request.nextUrl.pathname;
  const clientPort = Number(demo.client_port ?? demo.demo_port);
  const serverPort = Number(demo.server_port ?? clientPort);
  const isSplitApi = serverPort && serverPort !== clientPort;
  const apiPrefix = `${uiPrefix}/api`;
  const isApiPath = pathname === apiPrefix || pathname.startsWith(`${apiPrefix}/`);

  let targetPort = clientPort;
  let targetPath = stripDemoPrefix(pathname, uiPrefix);

  if (isSplitApi && isApiPath) {
    targetPort = serverPort;
    const rest = pathname.slice(apiPrefix.length) || '/';
    targetPath = `/api${rest.startsWith('/') ? rest : `/${rest}`}`;
  }

  if (!targetPort) {
    return new NextResponse(`Demo unavailable (${slug}). Start it in MultiServer.`, { status: 502 });
  }

  const targetUrl = buildTargetUrl(targetPort, targetPath, request.nextUrl.search);
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.delete('host');

  let body: ArrayBuffer | undefined;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: request.method,
      headers: forwardHeaders,
      body,
      redirect: 'manual',
    });
  } catch {
    return new NextResponse(`Demo unavailable (${slug}). Start it in MultiServer, then refresh.`, {
      status: 502,
    });
  }

  const responseHeaders = new Headers();
  const skip = hopByHopHeaders();
  upstream.headers.forEach((value, key) => {
    if (!skip.has(key.toLowerCase())) responseHeaders.set(key, value);
  });

  responseHeaders.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  responseHeaders.set('Pragma', 'no-cache');
  responseHeaders.set('Expires', '0');

  const location = upstream.headers.get('location');
  if (location) {
    responseHeaders.set('location', rewriteLocationHeader(location, uiPrefix));
  }

  const contentType = upstream.headers.get('content-type') || '';
  const shouldRewriteHtml =
    contentType.includes('text/html') && !isApiPath;

  if (shouldRewriteHtml) {
    const html = rewriteDemoHtmlAssets(await upstream.text(), uiPrefix);
    relaxDemoCsp(responseHeaders);
    return new NextResponse(html, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
