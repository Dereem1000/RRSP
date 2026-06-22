import { randomBytes } from 'crypto';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { SystemConfig, getMonorepoRoot } from '@cd-v2/database';
import { getConfiguredSiteUrl } from '@/lib/site-url';

const execFileAsync = promisify(execFile);

export const MINI_DOCKED_KEY = 'mini_docked';
export const MINI_INSTALL_PATH_KEY = 'mini_install_path';
export const MINI_LOCAL_URL_KEY = 'mini_local_url';
export const MINI_PUBLIC_URL_KEY = 'mini_public_url';
export const MINI_API_TOKEN_KEY = 'mini_api_token';
export const MINI_START_WITH_CD_KEY = 'mini_start_with_cd';
export const MINI_PORT_KEY = 'mini_port';
export const MINI_LAST_SEEN_AT_KEY = 'mini_last_seen_at';
export const MINI_LAST_ERROR_KEY = 'mini_last_error';

export type MiniDockConfig = {
  docked: boolean;
  installPath: string;
  localUrl: string;
  publicUrl: string;
  port: number;
  startWithCd: boolean;
  apiTokenConfigured: boolean;
  tokenPreview: string | null;
  connected: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export type MiniDockFile = {
  docked: boolean;
  installPath: string;
  localUrl: string;
  publicUrl: string;
  port: number;
  startWithCd: boolean;
  apiToken: string;
  updatedAt: string;
};

function miniDockFilePath(): string {
  return path.join(getMonorepoRoot(), 'data', 'mini-dock.json');
}

export function getDefaultMiniPublicUrl(): string {
  const site = getConfiguredSiteUrl();
  if (site) {
    try {
      const url = new URL(site);
      return `https://mini.${url.hostname.replace(/^www\./, '')}`;
    } catch {
      /* fall through */
    }
  }
  return 'https://mini.computerdynamicstt.com';
}

export function getDefaultMiniLocalUrl(port = 8876): string {
  return `http://127.0.0.1:${port}`;
}

export function maskMiniApiToken(token: string): string {
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

async function setMiniConfigs(
  entries: Array<[string, unknown, 'string' | 'number' | 'boolean']>
): Promise<void> {
  for (const [key, value, type] of entries) {
    await SystemConfig.setConfig(key, value, type, 'mini');
  }
}

export function generateMiniApiToken(): string {
  return randomBytes(32).toString('hex');
}

function normalizeInstallPath(installPath: string): string {
  return installPath.trim().replace(/\//g, '\\');
}

function readDashboardUrlFromMini(installPath: string): string | null {
  try {
    const urlPath = path.join(installPath, 'runtime', 'dashboard.url');
    if (!fs.existsSync(urlPath)) return null;
    const raw = fs.readFileSync(urlPath, 'utf8').trim();
    return raw || null;
  } catch {
    return null;
  }
}

export function validateMiniInstallPath(installPath: string): { ok: boolean; message: string } {
  const normalized = normalizeInstallPath(installPath);
  if (!normalized) {
    return { ok: false, message: 'Install path is required' };
  }
  const dashboardPy = path.join(normalized, 'dashboard.py');
  const startBat = path.join(normalized, 'start_system.bat');
  if (!fs.existsSync(dashboardPy)) {
    return { ok: false, message: `dashboard.py not found in ${normalized}` };
  }
  if (!fs.existsSync(startBat)) {
    return { ok: false, message: `start_system.bat not found in ${normalized}` };
  }
  return { ok: true, message: 'Mini install path looks valid' };
}

function upsertMiniLocalEnv(installPath: string, apiToken: string): void {
  const envPath = path.join(installPath, 'runtime', 'local.env');
  const envExample = path.join(installPath, 'runtime', 'local.env.example');
  fs.mkdirSync(path.dirname(envPath), { recursive: true });

  let lines: string[] = [];
  if (fs.existsSync(envPath)) {
    lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  } else if (fs.existsSync(envExample)) {
    lines = fs.readFileSync(envExample, 'utf8').split(/\r?\n/);
  }

  const keys = new Set(['MINI_API_TOKEN', 'MINI_PUBLIC_MODE']);
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return true;
    const key = trimmed.split('=')[0]?.trim();
    return !keys.has(key);
  });

  while (filtered.length && filtered[filtered.length - 1].trim() === '') {
    filtered.pop();
  }

  filtered.push(
    '',
    '# Mini API security (managed by Computer Dynamics integration)',
    `MINI_API_TOKEN=${apiToken}`,
    'MINI_PUBLIC_MODE=1'
  );

  fs.writeFileSync(envPath, `${filtered.join('\n')}\n`, 'utf8');
}

export async function readMiniDockFile(): Promise<MiniDockFile | null> {
  const filePath = miniDockFilePath();
  if (!fs.existsSync(filePath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as MiniDockFile;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeMiniDockFile(config: MiniDockFile): Promise<void> {
  const filePath = miniDockFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export async function getMiniDockSettings(): Promise<MiniDockConfig> {
  const [
    docked,
    installPath,
    localUrl,
    publicUrl,
    apiToken,
    startWithCd,
    port,
    lastSeenAt,
    lastError,
  ] = await Promise.all([
    SystemConfig.getConfig<boolean>(MINI_DOCKED_KEY, false),
    SystemConfig.getConfig<string>(MINI_INSTALL_PATH_KEY, ''),
    SystemConfig.getConfig<string>(MINI_LOCAL_URL_KEY, getDefaultMiniLocalUrl()),
    SystemConfig.getConfig<string>(MINI_PUBLIC_URL_KEY, getDefaultMiniPublicUrl()),
    SystemConfig.getConfig<string>(MINI_API_TOKEN_KEY, null),
    SystemConfig.getConfig<boolean>(MINI_START_WITH_CD_KEY, true),
    SystemConfig.getConfig<number>(MINI_PORT_KEY, 8876),
    SystemConfig.getConfig<string>(MINI_LAST_SEEN_AT_KEY, null),
    SystemConfig.getConfig<string>(MINI_LAST_ERROR_KEY, null),
  ]);

  const file = await readMiniDockFile();
  const token = apiToken?.trim() || file?.apiToken?.trim() || '';

  return {
    docked: Boolean(docked),
    installPath: installPath?.trim() || file?.installPath || '',
    localUrl: localUrl?.trim() || file?.localUrl || getDefaultMiniLocalUrl(Number(port) || 8876),
    publicUrl: publicUrl?.trim() || file?.publicUrl || getDefaultMiniPublicUrl(),
    port: Number(port) || 8876,
    startWithCd: startWithCd !== false,
    apiTokenConfigured: Boolean(token),
    tokenPreview: token ? maskMiniApiToken(token) : null,
    connected: Boolean(lastSeenAt) && !lastError,
    lastSeenAt: lastSeenAt || null,
    lastError: lastError || null,
    updatedAt: file?.updatedAt || null,
  };
}

export async function saveMiniDockSettings(input: {
  docked: boolean;
  installPath: string;
  localUrl?: string;
  publicUrl?: string;
  startWithCd?: boolean;
  port?: number;
  regenerateToken?: boolean;
  apiToken?: string;
}): Promise<{ settings: MiniDockConfig; apiToken?: string }> {
  if (!input.docked) {
    await setMiniConfigs([
      [MINI_DOCKED_KEY, false, 'boolean'],
      [MINI_LAST_ERROR_KEY, '', 'string'],
    ]);
    const updatedAt = new Date().toISOString();
    const existing = await readMiniDockFile();
    await writeMiniDockFile({
      docked: false,
      installPath: existing?.installPath || input.installPath.trim(),
      localUrl: existing?.localUrl || getDefaultMiniLocalUrl(),
      publicUrl: existing?.publicUrl || getDefaultMiniPublicUrl(),
      port: existing?.port || 8876,
      startWithCd: input.startWithCd !== false,
      apiToken: existing?.apiToken || (await SystemConfig.getConfig<string>(MINI_API_TOKEN_KEY, '')) || '',
      updatedAt,
    });
    const settings = await getMiniDockSettings();
    return { settings };
  }

  const installPath = normalizeInstallPath(input.installPath);
  const validation = validateMiniInstallPath(installPath);
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  const port = input.port || 8876;
  const detectedUrl = readDashboardUrlFromMini(installPath);
  const localUrl = (input.localUrl?.trim() || detectedUrl || getDefaultMiniLocalUrl(port)).replace(/\/$/, '');
  const publicUrl = (input.publicUrl?.trim() || getDefaultMiniPublicUrl()).replace(/\/$/, '');
  const startWithCd = input.startWithCd !== false;

  let apiToken = input.apiToken?.trim() || (await SystemConfig.getConfig<string>(MINI_API_TOKEN_KEY, '')) || '';
  if (input.regenerateToken || !apiToken) {
    apiToken = generateMiniApiToken();
  }
  if (apiToken.length < 16) {
    throw new Error('Mini API token must be at least 16 characters');
  }

  upsertMiniLocalEnv(installPath, apiToken);

  await setMiniConfigs([
    [MINI_DOCKED_KEY, input.docked, 'boolean'],
    [MINI_INSTALL_PATH_KEY, installPath, 'string'],
    [MINI_LOCAL_URL_KEY, localUrl, 'string'],
    [MINI_PUBLIC_URL_KEY, publicUrl, 'string'],
    [MINI_API_TOKEN_KEY, apiToken, 'string'],
    [MINI_START_WITH_CD_KEY, startWithCd, 'boolean'],
    [MINI_PORT_KEY, port, 'number'],
    [MINI_LAST_ERROR_KEY, '', 'string'],
  ]);

  const updatedAt = new Date().toISOString();
  await writeMiniDockFile({
    docked: input.docked,
    installPath,
    localUrl,
    publicUrl,
    port,
    startWithCd,
    apiToken,
    updatedAt,
  });

  const settings = await getMiniDockSettings();
  return { settings, apiToken: input.regenerateToken || input.docked ? apiToken : undefined };
}

export async function recordMiniHealth(result: { ok: boolean; error?: string | null }): Promise<void> {
  if (result.ok) {
    await setMiniConfigs([
      [MINI_LAST_SEEN_AT_KEY, new Date().toISOString(), 'string'],
      [MINI_LAST_ERROR_KEY, '', 'string'],
    ]);
    return;
  }
  await SystemConfig.setConfig(MINI_LAST_ERROR_KEY, result.error || 'Mini unreachable', 'string', 'mini');
}

export async function getMiniApiToken(): Promise<string | null> {
  const dbToken = await SystemConfig.getConfig<string>(MINI_API_TOKEN_KEY, null);
  if (dbToken?.trim()) return dbToken.trim();
  const file = await readMiniDockFile();
  return file?.apiToken?.trim() || null;
}

export async function isMiniDockActive(): Promise<boolean> {
  const settings = await getMiniDockSettings();
  return settings.docked && settings.apiTokenConfigured;
}

export type MiniProxyResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export async function miniProxyRequest(
  targetPath: string,
  init: RequestInit = {}
): Promise<MiniProxyResult> {
  const settings = await getMiniDockSettings();
  if (!settings.docked) {
    return { ok: false, status: 503, body: { error: 'Mini is not docked' } };
  }

  const token = await getMiniApiToken();
  if (!token) {
    return { ok: false, status: 503, body: { error: 'Mini API token is not configured' } };
  }

  const base = settings.localUrl.replace(/\/$/, '');
  const url = `${base}${targetPath.startsWith('/') ? targetPath : `/${targetPath}`}`;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const response = await fetch(url, { ...init, headers, cache: 'no-store' });
    const text = await response.text();
    let body: unknown = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = { raw: text };
      }
    }
    if (response.ok) {
      await recordMiniHealth({ ok: true });
    } else if (response.status >= 500 || response.status === 401) {
      await recordMiniHealth({ ok: false, error: `Mini returned HTTP ${response.status}` });
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Mini request failed';
    await recordMiniHealth({ ok: false, error: message });
    return { ok: false, status: 502, body: { error: message } };
  }
}

export async function probeMiniHealth(): Promise<{ ok: boolean; message: string; auth?: unknown }> {
  const result = await miniProxyRequest('/api/health', { method: 'GET' });
  if (!result.ok) {
    const error = (result.body as { error?: string })?.error || `HTTP ${result.status}`;
    return { ok: false, message: error };
  }
  return { ok: true, message: 'Mini is reachable', auth: result.body };
}

/** After a cloudflared-only restart, confirm docked Mini is still on localhost (tunnel restart does not stop Mini). */
export async function ensureDockedMiniRunning(): Promise<string | null> {
  const settings = await getMiniDockSettings();
  if (!settings.docked || !settings.installPath.trim()) return null;

  const initial = await probeMiniHealth();
  if (initial.ok) return 'Mini: still running on localhost';

  const startBat = path.join(settings.installPath, 'start_mini_headless.bat');
  if (!fs.existsSync(startBat)) {
    return `Mini: not responding on ${settings.localUrl} — restart manually from ${settings.installPath}`;
  }

  await execFileAsync('cmd.exe', ['/c', startBat], {
    windowsHide: true,
    timeout: 60_000,
    cwd: settings.installPath,
  });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const retry = await probeMiniHealth();
    if (retry.ok) return 'Mini: was down after tunnel restart — restarted successfully';
  }

  return `Mini: still not responding on ${settings.localUrl} — check the Mini AI Core window`;
}
