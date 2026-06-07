import { SystemConfig } from '@cd-v2/database';
import { logSecurityEvent } from './events';
import { getLicenseApiInternalBase } from './license-paths';

export const LicenseHealthKeys = {
  lastCheck: 'security_license_api_last_check',
  status: 'security_license_api_status',
  latencyMs: 'security_license_api_latency_ms',
  lastError: 'security_license_api_last_error',
} as const;

export type LicenseApiHealth = {
  status: 'online' | 'offline' | 'disabled' | 'unknown';
  latencyMs: number | null;
  lastCheck: string | null;
  baseUrl: string;
  message?: string;
};

export type LicenseHealthCheckOptions = {
  /** Log security events when the API is unreachable (default true). */
  logOffline?: boolean;
  /** Retry count when the API is still starting (default 3). */
  retries?: number;
  retryDelayMs?: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLicenseHealth(
  baseUrl: string,
  retries: number,
  retryDelayMs: number
): Promise<{ ok: boolean; status: number; latencyMs: number }> {
  let lastStatus = 0;
  for (let attempt = 0; attempt < retries; attempt++) {
    const started = Date.now();
    try {
      const res = await fetch(`${baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(8000),
      });
      lastStatus = res.status;
      if (res.ok) {
        return { ok: true, status: res.status, latencyMs: Date.now() - started };
      }
    } catch {
      lastStatus = 0;
    }
    if (attempt < retries - 1) {
      await sleep(retryDelayMs);
    }
  }
  return { ok: false, status: lastStatus, latencyMs: 0 };
}

export async function checkLicenseApiHealth(
  options: LicenseHealthCheckOptions = {}
): Promise<LicenseApiHealth> {
  const logOffline = options.logOffline !== false;
  const retries = options.retries ?? 3;
  const retryDelayMs = options.retryDelayMs ?? 2000;
  const baseUrl = getLicenseApiInternalBase();
  const lastCheck = new Date().toISOString();

  if (process.env.LICENSE_MONITORING_ENABLED === 'false') {
    return { status: 'disabled', latencyMs: null, lastCheck, baseUrl };
  }

  try {
    const { ok, status, latencyMs } = await fetchLicenseHealth(baseUrl, retries, retryDelayMs);
    const online = ok;

    await SystemConfig.setConfig(LicenseHealthKeys.lastCheck, lastCheck, 'string', 'security');
    await SystemConfig.setConfig(
      LicenseHealthKeys.status,
      online ? 'online' : 'offline',
      'string',
      'security'
    );
    await SystemConfig.setConfig(LicenseHealthKeys.latencyMs, online ? latencyMs : 0, 'number', 'security');
    await SystemConfig.setConfig(
      LicenseHealthKeys.lastError,
      online ? '' : status > 0 ? `HTTP ${status}` : 'Connection refused or timeout',
      'string',
      'security'
    );

    if (!online && logOffline) {
      await logSecurityEvent({
        eventType: 'license_api_offline',
        severity: 'high',
        description:
          status > 0
            ? `License API health check failed (HTTP ${status})`
            : 'License API unreachable (connection refused or timeout)',
        details: { baseUrl, latencyMs },
      });
    }

    return {
      status: online ? 'online' : 'offline',
      latencyMs: online ? latencyMs : null,
      lastCheck,
      baseUrl,
      message: online ? undefined : status > 0 ? `HTTP ${status}` : 'Connection refused or timeout',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await SystemConfig.setConfig(LicenseHealthKeys.lastCheck, lastCheck, 'string', 'security');
    await SystemConfig.setConfig(LicenseHealthKeys.status, 'offline', 'string', 'security');
    await SystemConfig.setConfig(LicenseHealthKeys.lastError, message, 'string', 'security');

    if (logOffline) {
      await logSecurityEvent({
        eventType: 'license_api_offline',
        severity: 'high',
        description: `License API unreachable: ${message}`,
        details: { baseUrl },
        skipDedup: false,
      });
    }

    return {
      status: 'offline',
      latencyMs: null,
      lastCheck,
      baseUrl,
      message,
    };
  }
}

function normalizeLastCheck(raw: unknown): string | null {
  if (raw == null || raw === '' || raw === 'null' || raw === 'Never') return null;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' && Number.isFinite(raw)) return new Date(raw).toISOString();
  return null;
}

export async function getLicenseApiHealthSnapshot(): Promise<LicenseApiHealth> {
  const lastCheck = normalizeLastCheck(
    await SystemConfig.getConfig(LicenseHealthKeys.lastCheck, null)
  );
  const statusRaw = await SystemConfig.getConfig<string>(LicenseHealthKeys.status, 'unknown');
  const status: LicenseApiHealth['status'] =
    statusRaw === 'online' ||
    statusRaw === 'offline' ||
    statusRaw === 'disabled' ||
    statusRaw === 'unknown'
      ? statusRaw
      : lastCheck
        ? 'offline'
        : 'unknown';
  const latencyMs = await SystemConfig.getConfig<number | null>(LicenseHealthKeys.latencyMs, null);
  const lastError = await SystemConfig.getConfig<string | null>(LicenseHealthKeys.lastError, null);

  return {
    status,
    latencyMs: latencyMs ?? null,
    lastCheck,
    baseUrl: getLicenseApiInternalBase(),
    message: lastError && lastError !== '' ? lastError : undefined,
  };
}
