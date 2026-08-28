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

export async function isMiniDockConfigured(): Promise<boolean> {
  const settings = await getMiniDockSettings();
  return settings.docked && settings.apiTokenConfigured;
}

/** Mini integration is saved in settings (may still be offline). */
export async function isMiniDockActive(): Promise<boolean> {
  return isMiniDockConfigured();
}

/** Mini is configured and responding on localhost. */
export async function isMiniDockOnline(): Promise<boolean> {
  if (!(await isMiniDockConfigured())) return false;
  const probe = await probeMiniHealth();
  return probe.ok;
}

const MINI_PROXY_TIMEOUT_MS = 18_000;
/** Health probes should tolerate a busy Mini host without false offline flips. */
const MINI_HEALTH_PROBE_TIMEOUT_MS = 10_000;
/** Dashboard, chat-feed, and event reads can be slow when Mini is busy (LLM cycle, hydration). */
export const MINI_READ_PROXY_TIMEOUT_MS = 45_000;
/** Project Guard scan and policy approval (live reads / small writes). */
export const MINI_PROJECT_GUARD_PROXY_TIMEOUT_MS = 300_000;
/** Deploy-baseline snapshots a full project and pushes many batches to remote systems. */
export const MINI_BASELINE_DEPLOY_TIMEOUT_MS = 900_000;
/** Mini chat can invoke the LLM and may run longer than generic proxy calls. */
export const MINI_CHAT_PROXY_TIMEOUT_MS = 120_000;
/** Portal telemetry (page views) — short timeout, failures are acceptable. */
export const MINI_CD_EVENT_PROXY_TIMEOUT_MS = 8_000;
export const MINI_PROVISIONING_RUN_TIMEOUT_MS = 900_000;
export const MINI_PROVISIONING_PICK_TIMEOUT_MS = 320_000;
/** Listing registered systems + checklist can be slow when Mini is busy. */
export const MINI_PROVISIONING_READ_TIMEOUT_MS = 45_000;
export const MINI_KIT_PUSH_TIMEOUT_MS = 900_000;
const MINI_ONLINE_CACHE_MS = 45_000;
/** Consecutive reachability failures before CD treats Mini as offline. */
const MINI_OFFLINE_STREAK_THRESHOLD = 5;
/** Retry transient Mini connection errors before surfacing UI warnings. */
const MINI_TRANSIENT_RETRY_ATTEMPTS = 3;
const MINI_TRANSIENT_RETRY_DELAY_MS = 500;
/** Deduplicate overlapping CD → Mini GET proxies (multiple UI polls hit the same path). */
const MINI_READ_PROXY_CACHE_MS = 5_000;
/** Reject oversized Mini payloads before JSON.parse balloons the API/web heap. */
const MAX_MINI_PROXY_BODY_BYTES = 8 * 1024 * 1024;
const MINI_CACHEABLE_GET_PATHS = new Set([
  '/api/health',
  '/api/dashboard',
  '/api/dashboard/summary',
  '/api/dashboard/chat-feed',
  '/api/external-systems',
]);

async function readMiniResponseText(
  response: Response,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; bytes: number }> {
  const declared = Number(response.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    try {
      await response.body?.cancel();
    } catch {
      /* ignore */
    }
    return { ok: false, bytes: declared };
  }

  if (!response.body) {
    return { ok: true, text: '' };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      return { ok: false, bytes: total };
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder('utf-8').decode(merged) };
}

function isMiniRequestTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return error.name === 'TimeoutError' || error.name === 'AbortError' || msg.includes('timeout');
}

function isMiniTransientConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (isMiniRequestTimeout(error)) return true;
  const parts = [error.message, error.name];
  const cause = error.cause;
  if (cause instanceof Error) {
    parts.push(cause.message, cause.name);
  } else if (typeof cause === 'string') {
    parts.push(cause);
  }
  const combined = parts.join(' ').toLowerCase();
  return (
    combined.includes('econnreset')
    || combined.includes('econnaborted')
    || combined.includes('econnrefused')
    || combined.includes('socket hang up')
    || combined.includes('network socket disconnected')
    || combined.includes('connection was aborted')
    || combined.includes('connection aborted')
    || combined.includes('other side closed')
    || combined.includes('fetch failed')
  );
}

/** Prefer runtime/dashboard.url from the Mini install folder over stale CD settings. */
export function resolveMiniLocalBaseUrl(settings: MiniDockConfig): string {
  const configured = settings.localUrl.trim().replace(/\/$/, '');
  if (!settings.installPath.trim()) {
    return configured || getDefaultMiniLocalUrl(settings.port);
  }
  const detected = readDashboardUrlFromMini(settings.installPath);
  return (detected || configured || getDefaultMiniLocalUrl(settings.port)).replace(/\/$/, '');
}

/** Ordered Mini bases for CD → Mini proxying. Co-located installs use localhost only (no tunnel loop). */
export function resolveMiniProxyBaseUrls(settings: MiniDockConfig): string[] {
  const local = resolveMiniLocalBaseUrl(settings);
  const publicBase = settings.publicUrl.trim().replace(/\/$/, '');
  if (settings.installPath.trim()) {
    // Same machine as Mini — never fall back to the public tunnel URL. A slow localhost
    // response would otherwise retry through Cloudflare and back into cloudflared.
    return [local];
  }
  const bases: string[] = [];
  if (publicBase) bases.push(publicBase);
  if (!bases.includes(local)) bases.push(local);
  return bases;
}

function isRetryableMiniProxyStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

let miniOnlineCache: { checkedAt: number; online: boolean } | null = null;
let miniOnlineProbeInFlight: Promise<boolean> | null = null;
let miniOfflineStreak = 0;
const miniProxyInFlight = new Map<string, Promise<MiniProxyResult>>();
const miniProxyReadCache = new Map<string, { checkedAt: number; result: MiniProxyResult }>();

function miniProxyDedupeKey(method: string, targetPath: string, init: RequestInit = {}): string {
  const pathSuffix = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
  const verb = method.toUpperCase();
  if (verb !== 'GET' && verb !== 'HEAD' && init.body) {
    const bodyKey = typeof init.body === 'string' ? init.body : '';
    return `${verb}:${pathSuffix}:${bodyKey}`;
  }
  return `${verb}:${pathSuffix}`;
}

function getCachedMiniProxyResult(key: string): MiniProxyResult | null {
  const cached = miniProxyReadCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.checkedAt > MINI_READ_PROXY_CACHE_MS) {
    miniProxyReadCache.delete(key);
    return null;
  }
  return cached.result;
}

function cacheMiniProxyResult(key: string, result: MiniProxyResult): void {
  if (!result.ok) return;
  miniProxyReadCache.set(key, { checkedAt: Date.now(), result });
}

/** Non-blocking online snapshot for status UI — never waits on a health probe. */
export function getMiniOnlineSnapshot(): { online: boolean; checking: boolean } {
  void refreshMiniOnlineCache();
  return {
    online: miniOnlineCache?.online ?? false,
    checking: miniOnlineProbeInFlight !== null,
  };
}

export function invalidateMiniOnlineCache(): void {
  miniOnlineCache = null;
  miniOfflineStreak = 0;
}

function noteMiniReachability(success: boolean, options?: { recordHealth?: boolean; error?: string | null }): void {
  if (success) {
    miniOfflineStreak = 0;
    markMiniOnline(true);
    if (options?.recordHealth !== false) {
      void recordMiniHealth({ ok: true });
    }
    return;
  }

  miniOfflineStreak += 1;
  if (miniOfflineStreak < MINI_OFFLINE_STREAK_THRESHOLD) {
    return;
  }

  markMiniOnline(false);
  if (options?.recordHealth !== false) {
    void recordMiniHealth({ ok: false, error: options?.error || 'Mini unreachable' });
  }
}

async function refreshMiniOnlineCache(): Promise<boolean> {
  if (miniOnlineProbeInFlight) return miniOnlineProbeInFlight;

  miniOnlineProbeInFlight = (async () => {
    const probe = await probeMiniHealth();
    if (probe.ok) {
      miniOfflineStreak = 0;
      miniOnlineCache = { checkedAt: Date.now(), online: true };
      return true;
    }

    miniOfflineStreak += 1;
    const wasOnline = miniOnlineCache?.online === true;
    const online = wasOnline && miniOfflineStreak < MINI_OFFLINE_STREAK_THRESHOLD;
    miniOnlineCache = { checkedAt: Date.now(), online };
    return online;
  })().finally(() => {
    miniOnlineProbeInFlight = null;
  });

  return miniOnlineProbeInFlight;
}

export async function isMiniDockOnlineCached(options?: { force?: boolean }): Promise<boolean> {
  const now = Date.now();
  if (!options?.force && miniOnlineCache && now - miniOnlineCache.checkedAt < MINI_ONLINE_CACHE_MS) {
    return miniOnlineCache.online;
  }

  if (!options?.force) {
    void refreshMiniOnlineCache();
    return miniOnlineCache?.online ?? false;
  }

  return refreshMiniOnlineCache();
}

/** Fast gate for Mini API routes — returns a user-facing error when Mini cannot be reached. */
export async function miniApiUnavailableReason(options?: { forceProbe?: boolean }): Promise<string | null> {
  if (!(await isMiniDockConfigured())) {
    return 'Mini integration is not configured';
  }

  if (options?.forceProbe) {
    if (!(await isMiniDockOnlineCached({ force: true }))) {
      return 'Mini is not running';
    }
    return null;
  }

  // Keep status cache warm for the UI, but do not block API routes on a short-lived offline flag.
  void refreshMiniOnlineCache();
  return null;
}

function markMiniOnline(online: boolean): void {
  miniOnlineCache = { checkedAt: Date.now(), online };
}

export type MiniProxyResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export type MiniProxyOptions = {
  timeoutMs?: number;
  /** When false, a failed request does not flip the short-lived online cache (e.g. long audits). */
  updateOnlineCache?: boolean;
};

export async function miniProxyRequest(
  targetPath: string,
  init: RequestInit = {},
  options: MiniProxyOptions = {},
): Promise<MiniProxyResult> {
  const method = (init.method || 'GET').toUpperCase();
  const dedupeKey = miniProxyDedupeKey(method, targetPath, init);
  const pathOnly = dedupeKey.split(':', 2)[1] || targetPath;

  if (method === 'GET' && MINI_CACHEABLE_GET_PATHS.has(pathOnly)) {
    const cached = getCachedMiniProxyResult(dedupeKey);
    if (cached) return cached;
    const inFlight = miniProxyInFlight.get(dedupeKey);
    if (inFlight) return inFlight;
  } else {
    const inFlight = miniProxyInFlight.get(dedupeKey);
    if (inFlight) return inFlight;
  }

  const run = (async (): Promise<MiniProxyResult> => {
  const settings = await getMiniDockSettings();
  if (!settings.docked) {
    return { ok: false, status: 503, body: { error: 'Mini is not docked' } };
  }

  const token = await getMiniApiToken();
  if (!token) {
    return { ok: false, status: 503, body: { error: 'Mini API token is not configured' } };
  }

  const bases = resolveMiniProxyBaseUrls(settings);
  const timeoutMs = options.timeoutMs ?? MINI_PROXY_TIMEOUT_MS;
  const updateOnlineCache = options.updateOnlineCache !== false;
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let lastResult: MiniProxyResult | null = null;

  for (let index = 0; index < bases.length; index += 1) {
    const base = bases[index];
    const pathSuffix = targetPath.startsWith('/') ? targetPath : `/${targetPath}`;
    // Remote CD hosts (no local Mini install path) only reach Mini through the tunnel — do not cap that attempt at 8s.
    const remoteOnlyMini = !settings.installPath.trim();
    const attemptTimeout =
      bases.length > 1 && index === 0 && !remoteOnlyMini
        ? Math.min(8_000, timeoutMs)
        : timeoutMs;

    for (let attempt = 0; attempt < MINI_TRANSIENT_RETRY_ATTEMPTS; attempt += 1) {
      const url = `${base}${pathSuffix}`;
      try {
        const response = await fetch(url, {
          ...init,
          headers,
          cache: 'no-store',
          signal: AbortSignal.timeout(attemptTimeout),
        });
        const read = await readMiniResponseText(response, MAX_MINI_PROXY_BODY_BYTES);
        if (!read.ok) {
          const result: MiniProxyResult = {
            ok: false,
            status: 502,
            body: {
              error: `Mini response too large (${read.bytes} bytes). Check Mini external-systems / library payloads.`,
              attempted_base: base,
            },
          };
          lastResult = result;
          return result;
        }
        const text = read.text;
        let body: unknown = {};
        if (text) {
          try {
            body = JSON.parse(text);
          } catch {
            const trimmed = text.trimStart().toLowerCase();
            if (trimmed.startsWith('<!doctype') || trimmed.startsWith('<html')) {
              body = {
                error:
                  'Mini returned an HTML page instead of JSON. Check Settings → Integrations → Local Mini URL (it should match runtime/dashboard.url in the Mini install folder, not the CD portal).',
              };
            } else {
              body = { raw: text.slice(0, 500) };
            }
          }
        }
        const result: MiniProxyResult = { ok: response.ok, status: response.status, body };
        lastResult = result;

        if (response.ok) {
          if (updateOnlineCache) noteMiniReachability(true);
          else void recordMiniHealth({ ok: true });
          const detected = settings.installPath.trim()
            ? readDashboardUrlFromMini(settings.installPath)?.replace(/\/$/, '')
            : null;
          if (detected && detected !== settings.localUrl.replace(/\/$/, '')) {
            await SystemConfig.setConfig(MINI_LOCAL_URL_KEY, detected, 'string', 'mini');
          }
          return result;
        }

        if (response.status === 401) {
          miniOfflineStreak = MINI_OFFLINE_STREAK_THRESHOLD;
          if (updateOnlineCache) markMiniOnline(false);
          await recordMiniHealth({
            ok: false,
            error: 'Mini API token rejected — re-save Settings → Integrations to sync the token',
          });
          return result;
        }

        if (response.status >= 500) {
          if (updateOnlineCache) {
            noteMiniReachability(false, { error: `Mini returned HTTP ${response.status}` });
          } else {
            await recordMiniHealth({ ok: false, error: `Mini returned HTTP ${response.status}` });
          }
        }

        if (index < bases.length - 1 && isRetryableMiniProxyStatus(response.status)) {
          break;
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Mini request failed';
        const timedOut = isMiniRequestTimeout(error);
        const transient = isMiniTransientConnectionError(error);
        const result: MiniProxyResult = {
          ok: false,
          status: timedOut ? 504 : 502,
          body: {
            error: timedOut
              ? 'Request timed out waiting for Mini (the operation may still be running on the Mini host)'
              : transient
                ? 'Temporary connection issue talking to Mini — retrying automatically'
                : message,
            attempted_base: base,
          },
        };
        lastResult = result;

        const canRetryAttempt = (timedOut || transient) && attempt < MINI_TRANSIENT_RETRY_ATTEMPTS - 1;
        if (canRetryAttempt) {
          await new Promise((resolve) =>
            setTimeout(resolve, MINI_TRANSIENT_RETRY_DELAY_MS * (attempt + 1))
          );
          continue;
        }

        if (index < bases.length - 1 && (timedOut || transient)) {
          break;
        }

        if (!timedOut && !transient) {
          if (updateOnlineCache) {
            noteMiniReachability(false, { error: message });
          } else {
            await recordMiniHealth({ ok: false, error: message });
          }
        }
        return result;
      }
    }
  }

  return (
    lastResult ?? {
      ok: false,
      status: 503,
      body: { error: 'No Mini base URL configured' },
    }
  );
  })();

  miniProxyInFlight.set(dedupeKey, run);
  try {
    const result = await run;
    if (method === 'GET' && MINI_CACHEABLE_GET_PATHS.has(pathOnly)) {
      cacheMiniProxyResult(dedupeKey, result);
    }
    return result;
  } finally {
    if (miniProxyInFlight.get(dedupeKey) === run) {
      miniProxyInFlight.delete(dedupeKey);
    }
  }
}

export async function probeMiniHealth(): Promise<{ ok: boolean; message: string; auth?: unknown }> {
  const settings = await getMiniDockSettings();
  const bases = resolveMiniProxyBaseUrls(settings);
  const result = await miniProxyRequest('/api/health', { method: 'GET' }, { timeoutMs: MINI_HEALTH_PROBE_TIMEOUT_MS });
  if (!result.ok) {
    const error = (result.body as { error?: string })?.error || `HTTP ${result.status}`;
    return {
      ok: false,
      message: `${error} (tried ${bases.join(', ')})`,
    };
  }
  return { ok: true, message: 'Mini is reachable', auth: result.body };
}

/** Fast gate for provisioning reads — uses cached Mini online state when possible. */
export async function getMiniProvisioningReadGateError(): Promise<string | null> {
  if (!(await isMiniDockConfigured())) {
    return 'Mini integration is not configured. Open Settings → Integrations and dock Mini first.';
  }
  const reason = await miniApiUnavailableReason();
  if (reason) {
    const settings = await getMiniDockSettings();
    const base = resolveMiniLocalBaseUrl(settings);
    return `Cannot reach Mini at ${base}. ${reason} Confirm Mini is running and Settings → Integrations → Local Mini URL matches runtime/dashboard.url in the Mini install folder.`;
  }
  return null;
}

/** User-facing gate message for provisioning and other Mini-backed CD tools. */
export async function getMiniProvisioningGateError(): Promise<string | null> {
  if (!(await isMiniDockConfigured())) {
    return 'Mini integration is not configured. Open Settings → Integrations and dock Mini first.';
  }
  invalidateMiniOnlineCache();
  const settings = await getMiniDockSettings();
  const base = resolveMiniLocalBaseUrl(settings);
  const probe = await probeMiniHealth();
  if (!probe.ok) {
    return `Cannot reach Mini at ${base}. ${probe.message} Confirm Mini is running and Settings → Integrations → Local Mini URL matches runtime/dashboard.url in the Mini install folder.`;
  }
  return null;
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
