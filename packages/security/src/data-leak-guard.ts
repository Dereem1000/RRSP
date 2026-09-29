import { Op } from 'sequelize';
import { SecurityEvent, SystemConfig } from '@cd-v2/database';
import { blockIp } from './http-guard';
import { logSecurityEvent } from './events';
import { whereCreatedSince } from './sequelize-time';

export const DataLeakConfigKeys = {
  enabled: 'data_leak_guard_enabled',
  autoBlockIp: 'data_leak_auto_block_ip',
  recordsThreshold: 'data_leak_records_threshold',
  burstWindowMs: 'data_leak_burst_window_ms',
  burstAccessThreshold: 'data_leak_burst_access_threshold',
  bytesThreshold: 'data_leak_bytes_threshold',
} as const;

const DEFAULT_RECORDS_THRESHOLD = 150;
const DEFAULT_BURST_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_BURST_ACCESS_THRESHOLD = 30;
const DEFAULT_BYTES_THRESHOLD = 4 * 1024 * 1024;

export type SensitiveDataCategory =
  | 'backup_download'
  | 'backup_restore'
  | 'user_directory'
  | 'client_directory'
  | 'ticket_directory'
  | 'security_audit'
  | 'settings_secrets'
  | 'license_sensitive';

export type DataAccessAuditInput = {
  method: string;
  path: string;
  urlPath: string;
  ip: string;
  userId?: number | null;
  userRole?: string | null;
  userAgent?: string | null;
  status: number;
  body?: unknown;
  rawBodyBytes?: number;
};

function normalizePathForMatch(path: string): string {
  const p = (path || '').split('?')[0]?.toLowerCase() || '';
  return p.replace(/\/+/g, '/');
}

function pathsForMatch(input: Pick<DataAccessAuditInput, 'path' | 'urlPath'>): string[] {
  const seen = new Set<string>();
  for (const raw of [input.urlPath, input.path]) {
    const n = normalizePathForMatch(raw);
    if (n) seen.add(n);
    if (n.startsWith('/api/')) seen.add(n.slice(4) || '/');
  }
  return [...seen];
}

export function classifySensitiveRoute(
  input: Pick<DataAccessAuditInput, 'method' | 'path' | 'urlPath'>
): SensitiveDataCategory | null {
  const method = input.method.toUpperCase();
  for (const p of pathsForMatch(input)) {
    if (method === 'GET' && /\/backup\/[^/]+\/download\/?$/.test(p)) return 'backup_download';
    if (/\/backup\/[^/]+\/(restore|verify)\/?$/.test(p) && method !== 'GET') return 'backup_restore';
    if (p.includes('/backup/upload') && method === 'POST') return 'backup_restore';
    if (method === 'GET' && (p === '/users' || /\/users\/?$/.test(p))) return 'user_directory';
    if (method === 'GET' && p.includes('/clients') && !p.includes('/client-portal')) {
      if (p.match(/\/clients\/?$/) || p.includes('/clients?')) return 'client_directory';
      if (p.match(/\/clients\/[^/]+\/?$/) && !p.includes('/related')) return 'client_directory';
    }
    if (method === 'GET' && p.includes('/tickets') && !p.includes('/client-portal')) {
      return 'ticket_directory';
    }
    if (method === 'GET' && p.includes('/security/events')) return 'security_audit';
    if (method === 'GET' && p.includes('/settings') && !p.includes('/public')) {
      return 'settings_secrets';
    }
    if (p.includes('/license') && (p.includes('serial') || p.includes('reveal'))) {
      return 'license_sensitive';
    }
  }
  return null;
}

export function estimateResponseRecordCount(body: unknown): number {
  if (body == null) return 0;
  if (Array.isArray(body)) return body.length;
  if (typeof body !== 'object') return 0;
  const o = body as Record<string, unknown>;
  if (o.success === false) return 0;
  const nested = o.data ?? o.body;
  if (Array.isArray(nested)) return nested.length;
  for (const key of [
    'clients',
    'users',
    'tickets',
    'items',
    'rows',
    'results',
    'backups',
    'events',
    'licenses',
    'products',
  ]) {
    const val = o[key];
    if (Array.isArray(val)) return val.length;
  }
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    for (const key of ['clients', 'users', 'tickets', 'items', 'events']) {
      if (Array.isArray(inner[key])) return (inner[key] as unknown[]).length;
    }
  }
  return 0;
}

export function estimateResponseBytes(input: Pick<DataAccessAuditInput, 'body' | 'rawBodyBytes'>): number {
  if (input.rawBodyBytes != null && input.rawBodyBytes > 0) return input.rawBodyBytes;
  if (input.body === undefined) return 0;
  try {
    return Buffer.byteLength(JSON.stringify(input.body), 'utf8');
  } catch {
    return 0;
  }
}

async function loadThresholds() {
  const [recordsThreshold, burstWindowMs, burstAccessThreshold, bytesThreshold] = await Promise.all([
    SystemConfig.getConfig<number>(DataLeakConfigKeys.recordsThreshold, DEFAULT_RECORDS_THRESHOLD),
    SystemConfig.getConfig<number>(DataLeakConfigKeys.burstWindowMs, DEFAULT_BURST_WINDOW_MS),
    SystemConfig.getConfig<number>(
      DataLeakConfigKeys.burstAccessThreshold,
      DEFAULT_BURST_ACCESS_THRESHOLD
    ),
    SystemConfig.getConfig<number>(DataLeakConfigKeys.bytesThreshold, DEFAULT_BYTES_THRESHOLD),
  ]);
  return {
    recordsThreshold: recordsThreshold || DEFAULT_RECORDS_THRESHOLD,
    burstWindowMs: burstWindowMs || DEFAULT_BURST_WINDOW_MS,
    burstAccessThreshold: burstAccessThreshold || DEFAULT_BURST_ACCESS_THRESHOLD,
    bytesThreshold: bytesThreshold || DEFAULT_BYTES_THRESHOLD,
  };
}

function actorKey(input: Pick<DataAccessAuditInput, 'userId' | 'ip'>): string {
  if (input.userId != null) return `user:${input.userId}`;
  return `ip:${input.ip || 'unknown'}`;
}

async function countRecentDataAccess(actor: string, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  return SecurityEvent.count({
    where: {
      ...whereCreatedSince(since),
      isActive: true,
      eventType: 'data_access',
      description: { [Op.like]: `%(${actor})%` },
    },
  });
}

async function maybeRaiseExfiltrationAlert(input: {
  actor: string;
  ip: string;
  userId?: number | null;
  userRole?: string | null;
  userAgent?: string | null;
  category: SensitiveDataCategory;
  path: string;
  reason: string;
  recordCount: number;
  bytes: number;
  accessCount: number;
}): Promise<void> {
  const autoBlock =
    (await SystemConfig.getConfig<boolean>(DataLeakConfigKeys.autoBlockIp, true)) !== false;

  await logSecurityEvent({
    eventType: 'data_exfiltration_suspected',
    severity: 'critical',
    description: `Possible data exfiltration: ${input.reason} (${input.actor})`,
    ipAddress: input.ip,
    userId: input.userId ?? null,
    userAgent: input.userAgent,
    details: {
      pattern: 'data_exfiltration',
      actor: input.actor,
      category: input.category,
      path: input.path,
      recordCount: input.recordCount,
      bytes: input.bytes,
      accessCount: input.accessCount,
      userRole: input.userRole ?? null,
    },
    outcome: 'blocked',
    skipDedup: true,
  });

  const blockUntrusted =
    autoBlock &&
    input.ip &&
    input.ip !== 'unknown' &&
    (!input.userId || input.userRole === 'client');

  if (blockUntrusted) {
    await blockIp(input.ip, `Data exfiltration guard: ${input.reason}`);
  }
}

/**
 * Audit successful sensitive API responses and raise alerts on bulk/burst patterns.
 */
export async function auditSensitiveApiResult(input: DataAccessAuditInput): Promise<void> {
  const enabled =
    (await SystemConfig.getConfig<boolean>(DataLeakConfigKeys.enabled, true)) !== false;
  if (!enabled || input.status < 200 || input.status >= 300) return;

  const category = classifySensitiveRoute(input);
  if (!category) return;

  const thresholds = await loadThresholds();
  const recordCount = estimateResponseRecordCount(input.body);
  const bytes = estimateResponseBytes(input);
  const actor = actorKey(input);
  const pathLabel = normalizePathForMatch(input.urlPath || input.path);

  const highVolumeCategory =
    category === 'backup_download' ||
    category === 'backup_restore' ||
    category === 'security_audit';

  const severity =
    category === 'backup_download' || category === 'backup_restore' ? 'high' : 'medium';

  await logSecurityEvent({
    eventType: 'data_access',
    severity,
    description: `Sensitive data access: ${category} ${input.method} ${pathLabel} (${actor})`,
    ipAddress: input.ip,
    userId: input.userId ?? null,
    userAgent: input.userAgent,
    details: {
      category,
      method: input.method,
      path: pathLabel,
      recordCount,
      bytes,
      userRole: input.userRole ?? null,
    },
    outcome: 'allowed',
  });

  const accessCount = await countRecentDataAccess(actor, thresholds.burstWindowMs);

  if (bytes >= thresholds.bytesThreshold) {
    await maybeRaiseExfiltrationAlert({
      actor,
      ip: input.ip,
      userId: input.userId,
      userRole: input.userRole,
      userAgent: input.userAgent,
      category,
      path: pathLabel,
      reason: `large response (${Math.round(bytes / 1024)} KB)`,
      recordCount,
      bytes,
      accessCount,
    });
    return;
  }

  if (recordCount >= thresholds.recordsThreshold && highVolumeCategory) {
    await maybeRaiseExfiltrationAlert({
      actor,
      ip: input.ip,
      userId: input.userId,
      userRole: input.userRole,
      category,
      path: pathLabel,
      reason: `${recordCount} records in one response`,
      recordCount,
      bytes,
      accessCount,
    });
    return;
  }

  if (accessCount >= thresholds.burstAccessThreshold) {
    await maybeRaiseExfiltrationAlert({
      actor,
      ip: input.ip,
      userId: input.userId,
      userRole: input.userRole,
      category,
      path: pathLabel,
      reason: `${accessCount} sensitive accesses in ${Math.round(thresholds.burstWindowMs / 60000)} min`,
      recordCount,
      bytes,
      accessCount,
    });
  }
}

/** Worker pass: detect burst data_access from DB (survives API restarts). */
export async function runDataLeakBurstMonitor(): Promise<{ alerts: number }> {
  const enabled =
    (await SystemConfig.getConfig<boolean>(DataLeakConfigKeys.enabled, true)) !== false;
  if (!enabled) return { alerts: 0 };

  const thresholds = await loadThresholds();
  const since = new Date(Date.now() - thresholds.burstWindowMs);
  const events = await SecurityEvent.findAll({
    where: {
      ...whereCreatedSince(since),
      isActive: true,
      eventType: 'data_access',
    },
    attributes: ['description', 'ipAddress', 'userId'],
    limit: 500,
  });

  const byActor = new Map<string, { count: number; ip: string; userId: number | null }>();
  for (const ev of events) {
    const match = ev.description.match(/\((user:\d+|ip:[^)]+)\)\s*$/);
    const key = match?.[1] ?? `ip:${ev.ipAddress ?? 'unknown'}`;
    const cur = byActor.get(key) ?? { count: 0, ip: ev.ipAddress ?? 'unknown', userId: ev.userId };
    cur.count++;
    byActor.set(key, cur);
  }

  let alerts = 0;
  for (const [actor, meta] of byActor) {
    if (meta.count < thresholds.burstAccessThreshold) continue;
    const recent = await SecurityEvent.count({
      where: {
        ...whereCreatedSince(since),
        isActive: true,
        eventType: 'data_exfiltration_suspected',
        description: { [Op.like]: `%(${actor})%` },
      },
    });
    if (recent > 0) continue;

    await maybeRaiseExfiltrationAlert({
      actor,
      ip: meta.ip,
      userId: meta.userId,
      category: 'security_audit',
      path: '(worker burst scan)',
      reason: `${meta.count} sensitive accesses in ${Math.round(thresholds.burstWindowMs / 60000)} min`,
      recordCount: 0,
      bytes: 0,
      accessCount: meta.count,
    });
    alerts++;
  }

  return { alerts };
}

export async function getDataLeakGuardSnapshot() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where24h = { ...whereCreatedSince(since24h), isActive: true };
  const [enabled, autoBlock, access24h, suspected24h] = await Promise.all([
    SystemConfig.getConfig<boolean>(DataLeakConfigKeys.enabled, true),
    SystemConfig.getConfig<boolean>(DataLeakConfigKeys.autoBlockIp, true),
    SecurityEvent.count({ where: { ...where24h, eventType: 'data_access' } }),
    SecurityEvent.count({ where: { ...where24h, eventType: 'data_exfiltration_suspected' } }),
  ]);
  return {
    enabled: enabled !== false,
    autoBlockIp: autoBlock !== false,
    dataAccess24h: access24h,
    suspectedExfiltration24h: suspected24h,
  };
}
