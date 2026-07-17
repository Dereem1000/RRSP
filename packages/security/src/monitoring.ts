import { Op } from 'sequelize';
import { SecurityEvent, SystemConfig } from '@cd-v2/database';
import {
  DEFAULT_MONITOR_INTERVAL_MS,
  SECURITY_WORKER_VERSION,
  SecurityConfigKeys,
  WORKER_STALE_MULTIPLIER,
} from './config-keys';
import { isEmergencyBypassActive, refreshEmergencyState } from './emergency';
import { runActivityMonitor } from './activity-monitor';
import {
  checkFileIntegrity,
  getExistingProtectedPaths,
  getProtectedFilePaths,
  PROTECTED_FILES_VERSION,
  snapshotAllProtectedFiles,
  snapshotFile,
  type FileBaseline,
} from './protected-files';
import { logSecurityEvent } from './events';
import { eventCreatedAt, ORDER_BY_CREATED_DESC, whereCreatedSince } from './sequelize-time';
import { isMasterAuthCodeConfigured } from './auth';
import { computeSecurityScore, getFeatureSnapshot } from './features';
import { runIntrusionPatternScan } from './intrusion-scan';
import { attemptFileRepairFromBackup } from './file-repair';

import type { ThreatLevel, WorkerHealth } from './types';
export type { ThreatLevel, WorkerHealth } from './types';

export type PlatformSecurityStatus = {
  monitoring: {
    enabled: boolean;
    threatLevel: ThreatLevel;
    eventsLast24h: number;
  };
  worker: {
    health: WorkerHealth;
    lastHeartbeat: string | null;
    version: string | null;
    checksTotal: number;
    lastError: string | null;
    intervalMs: number;
  };
  emergency: Awaited<ReturnType<typeof refreshEmergencyState>>;
  recentEvents: Array<{
    id: number;
    eventType: string;
    severity: string;
    description: string;
    createdAt: string;
  }>;
  protectedFiles: number;
  securityScore: number;
  features: Awaited<ReturnType<typeof getFeatureSnapshot>>;
  authCodeConfigured: boolean;
  maxBypassMinutes: number;
  license: {
    status: string;
    latencyMs: number | null;
    lastCheck: string | null;
    baseUrl: string;
    message?: string;
    dbAvailable: boolean;
    licenseCount: number;
    activeLicenseCount: number;
    events24h: {
      integrity: number;
      suspicious: number;
      mismatch: number;
      apiOffline: number;
    };
  };
  lastUpdated: string;
};

async function loadBaselines(): Promise<Record<string, FileBaseline>> {
  const raw = await SystemConfig.getConfig<Record<string, FileBaseline> | null>(
    SecurityConfigKeys.fileBaselines,
    null
  );
  return raw && typeof raw === 'object' ? raw : {};
}

async function saveBaselines(baselines: Record<string, FileBaseline>) {
  await SystemConfig.setConfig(
    SecurityConfigKeys.fileBaselines,
    baselines,
    'json',
    'security'
  );
}

export async function ensureFileBaselines(): Promise<Record<string, FileBaseline>> {
  const storedVersion = await SystemConfig.getConfig<string>(
    SecurityConfigKeys.fileBaselinesVersion,
    ''
  );

  if (storedVersion !== PROTECTED_FILES_VERSION) {
    const baselines = snapshotAllProtectedFiles();
    await saveBaselines(baselines);
    await SystemConfig.setConfig(
      SecurityConfigKeys.fileBaselinesVersion,
      PROTECTED_FILES_VERSION,
      'string',
      'security'
    );
    await logSecurityEvent({
      eventType: 'system_change',
      severity: 'low',
      description: `File integrity baselines auto-updated to catalog ${PROTECTED_FILES_VERSION}`,
      details: {
        previousVersion: storedVersion || null,
        fileCount: Object.keys(baselines).length,
      },
      outcome: 'allowed',
      skipDedup: true,
    });
    return baselines;
  }

  let baselines = await loadBaselines();
  const paths = getExistingProtectedPaths();
  let changed = false;

  for (const rel of paths) {
    if (!baselines[rel]) {
      const snap = snapshotFile(rel);
      if (snap) {
        baselines[rel] = snap;
        changed = true;
      }
    }
  }

  // Drop baselines for paths no longer in the catalog
  const allowed = new Set(getProtectedFilePaths());
  for (const key of Object.keys(baselines)) {
    if (!allowed.has(key)) {
      delete baselines[key];
      changed = true;
    }
  }

  if (changed) await saveBaselines(baselines);
  return baselines;
}

export async function runFileIntegrityPass(
  baselines: Record<string, FileBaseline>
): Promise<number> {
  let tamperCount = 0;
  const bypass = await isEmergencyBypassActive();
  for (const [rel, baseline] of Object.entries(baselines)) {
    const result = checkFileIntegrity(rel, baseline);
    if (!result.ok) {
      tamperCount++;
      await logSecurityEvent({
        eventType: 'file_integrity',
        severity: 'critical',
        description: `Protected file changed: ${result.relativePath} (${result.reason})`,
        details: { relativePath: result.relativePath, ...(result.details ?? { reason: result.reason }) },
      });
      if (!bypass && !result.relativePath.endsWith('package.json')) {
        await attemptFileRepairFromBackup(result.relativePath, result.reason);
      }
    }
  }
  return tamperCount;
}

export async function computeThreatLevel(): Promise<ThreatLevel> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const events = await SecurityEvent.findAll({
    where: { ...whereCreatedSince(since), isActive: true },
    attributes: ['severity'],
  });
  if (events.some((e) => e.severity === 'critical')) return 'critical';
  if (events.some((e) => e.severity === 'high')) return 'high';
  if (events.some((e) => e.severity === 'medium')) return 'medium';
  return 'low';
}

export function resolveWorkerHealth(
  enabled: boolean,
  lastHeartbeat: string | null,
  intervalMs: number
): WorkerHealth {
  if (!enabled) return 'disabled';
  if (!lastHeartbeat) return 'offline';
  const age = Date.now() - new Date(lastHeartbeat).getTime();
  const staleAfter = intervalMs * WORKER_STALE_MULTIPLIER;
  if (age > staleAfter * 3) return 'offline';
  if (age > staleAfter) return 'stale';
  return 'online';
}

/** Lightweight probe for /api/health — avoids security event scans and emergency refresh. */
export type PlatformHealthProbeDetails = {
  worker: PlatformSecurityStatus['worker'];
  license: Awaited<ReturnType<typeof import('./license-health').getLicenseApiHealthSnapshot>> & {
    dbAvailable: boolean;
    activeLicenseCount: number | null;
    licenseCount: number | null;
  };
};

export async function getPlatformHealthProbeDetails(): Promise<PlatformHealthProbeDetails> {
  const { getLicenseApiHealthSnapshot } = await import('./license-health');
  const [
    enabled,
    intervalMs,
    lastHeartbeat,
    version,
    checksTotal,
    lastError,
    apiHealth,
  ] = await Promise.all([
    SystemConfig.getConfig<boolean>(SecurityConfigKeys.monitoringEnabled, true),
    SystemConfig.getConfig<number>(
      SecurityConfigKeys.monitoringIntervalMs,
      DEFAULT_MONITOR_INTERVAL_MS
    ),
    SystemConfig.getConfig<string | null>(SecurityConfigKeys.workerHeartbeat, null),
    SystemConfig.getConfig<string | null>(SecurityConfigKeys.workerVersion, null),
    SystemConfig.getConfig<number>(SecurityConfigKeys.workerChecks, 0),
    SystemConfig.getConfig<string | null>(SecurityConfigKeys.workerLastError, null),
    getLicenseApiHealthSnapshot(),
  ]);

  const resolvedInterval = intervalMs || DEFAULT_MONITOR_INTERVAL_MS;
  const monitoringEnabled = enabled !== false;
  const { isLicenseDbAvailable } = await import('./license-paths');

  return {
    worker: {
      health: resolveWorkerHealth(monitoringEnabled, lastHeartbeat, resolvedInterval),
      lastHeartbeat: lastHeartbeat && lastHeartbeat !== 'null' ? lastHeartbeat : null,
      version,
      checksTotal: checksTotal || 0,
      lastError: lastError && lastError !== 'null' ? lastError : null,
      intervalMs: resolvedInterval,
    },
    license: {
      ...apiHealth,
      dbAvailable: isLicenseDbAvailable(),
      activeLicenseCount: null,
      licenseCount: null,
    },
  };
}

export async function getPlatformSecurityStatus(): Promise<PlatformSecurityStatus> {
  const enabled =
    (await SystemConfig.getConfig<boolean>(SecurityConfigKeys.monitoringEnabled, true)) !==
    false;
  const intervalMs =
    (await SystemConfig.getConfig<number>(
      SecurityConfigKeys.monitoringIntervalMs,
      DEFAULT_MONITOR_INTERVAL_MS
    )) || DEFAULT_MONITOR_INTERVAL_MS;
  const lastHeartbeat = await SystemConfig.getConfig<string | null>(
    SecurityConfigKeys.workerHeartbeat,
    null
  );
  const version = await SystemConfig.getConfig<string | null>(
    SecurityConfigKeys.workerVersion,
    null
  );
  const checksTotal =
    (await SystemConfig.getConfig<number>(SecurityConfigKeys.workerChecks, 0)) || 0;
  const lastError = await SystemConfig.getConfig<string | null>(
    SecurityConfigKeys.workerLastError,
    null
  );
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const recent = await SecurityEvent.findAll({
    where: { ...whereCreatedSince(since24h), isActive: true },
    order: ORDER_BY_CREATED_DESC,
    limit: 12,
  });

  const emergency = await refreshEmergencyState();
  const features = await getFeatureSnapshot();
  const threatLevel =
    ((await SystemConfig.getConfig<string>(SecurityConfigKeys.threatLevel, 'low')) as ThreatLevel) ||
    'low';
  const securityScore = computeSecurityScore(threatLevel, features);
  const { getLicenseApiHealthSnapshot } = await import('./license-health');
  const { getLicenseMonitoringSummary } = await import('./license-monitor');
  const [apiHealth, licenseSummary] = await Promise.all([
    getLicenseApiHealthSnapshot(),
    getLicenseMonitoringSummary(),
  ]);

  return {
    monitoring: {
      enabled,
      threatLevel,
      eventsLast24h: await SecurityEvent.count({
        where: { ...whereCreatedSince(since24h), isActive: true },
      }),
    },
    worker: {
      health: resolveWorkerHealth(enabled, lastHeartbeat, intervalMs),
      lastHeartbeat: lastHeartbeat && lastHeartbeat !== 'null' ? lastHeartbeat : null,
      version,
      checksTotal,
      lastError: lastError && lastError !== 'null' ? lastError : null,
      intervalMs,
    },
    emergency,
    recentEvents: recent.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      severity: e.severity,
      description: e.description,
      createdAt: eventCreatedAt(e),
    })),
    protectedFiles: getExistingProtectedPaths().length,
    securityScore,
    features,
    authCodeConfigured: await isMasterAuthCodeConfigured(),
    maxBypassMinutes: 43_200,
    license: { ...apiHealth, ...licenseSummary },
    lastUpdated: new Date().toISOString(),
  };
}

export async function getFileIntegrityReport() {
  const baselines = await ensureFileBaselines();
  const items: Array<{
    path: string;
    status: 'ok' | 'missing' | 'modified';
    reason?: string;
  }> = [];

  for (const [rel, baseline] of Object.entries(baselines)) {
    const result = checkFileIntegrity(rel, baseline);
    if (result.ok) {
      items.push({ path: rel, status: 'ok' });
    } else {
      items.push({
        path: rel,
        status: result.reason === 'file_missing' ? 'missing' : 'modified',
        reason: result.reason,
      });
    }
  }

  for (const rel of getProtectedFilePaths()) {
    if (!baselines[rel] && !items.some((i) => i.path === rel)) {
      items.push({ path: rel, status: 'missing', reason: 'not_baselined' });
    }
  }

  return {
    protected: items.length,
    ok: items.filter((i) => i.status === 'ok').length,
    issues: items.filter((i) => i.status !== 'ok').length,
    items,
  };
}

export async function rebaselineProtectedFiles() {
  const baselines = snapshotAllProtectedFiles();
  await saveBaselines(baselines);
  await SystemConfig.setConfig(
    SecurityConfigKeys.fileBaselinesVersion,
    PROTECTED_FILES_VERSION,
    'string',
    'security'
  );
  await logSecurityEvent({
    eventType: 'system_change',
    severity: 'low',
    description: 'Protected file integrity baselines refreshed by admin',
    details: { files: Object.keys(baselines).length, version: PROTECTED_FILES_VERSION },
    outcome: 'allowed',
    skipDedup: true,
  });
  return getFileIntegrityReport();
}

export async function setMonitoringEnabled(input: {
  enable: boolean;
  userId: number;
  userClearance: string;
  authorization?: string;
}) {
  if (!input.enable) {
    const developerMode = await SystemConfig.getConfig<boolean>('developer_mode', false);
    if (!developerMode) {
      throw new Error(
        'Monitoring can only be disabled when developer_mode is enabled.'
      );
    }
    if (input.userClearance !== 'S-CLS1') {
      throw new Error('Disabling monitoring requires S-CLS1 clearance.');
    }
    const { validateEmergencyAuthorization } = await import('./auth');
    if (!input.authorization?.trim()) {
      throw new Error('Authorization code is required to disable monitoring.');
    }
    const v = await validateEmergencyAuthorization(
      input.authorization,
      input.userClearance
    );
    if (!v.valid) throw new Error(v.reason);
  }

  await SystemConfig.setConfig(
    SecurityConfigKeys.monitoringEnabled,
    input.enable,
    'boolean',
    'security'
  );

  await logSecurityEvent({
    eventType: 'system_change',
    severity: input.enable ? 'low' : 'high',
    userId: input.userId,
    description: input.enable
      ? 'Security monitoring enabled'
      : 'Security monitoring disabled',
    details: { monitoringEnabled: input.enable },
    outcome: 'allowed',
    skipDedup: true,
  });

  return getPlatformSecurityStatus();
}

export async function runMonitorCycle(): Promise<void> {
  const enabled =
    (await SystemConfig.getConfig<boolean>(SecurityConfigKeys.monitoringEnabled, true)) !==
    false;

  const checks =
    ((await SystemConfig.getConfig<number>(SecurityConfigKeys.workerChecks, 0)) || 0) + 1;

  await SystemConfig.setConfig(
    SecurityConfigKeys.workerChecks,
    checks,
    'number',
    'security'
  );
  await SystemConfig.setConfig(
    SecurityConfigKeys.workerHeartbeat,
    new Date().toISOString(),
    'string',
    'security'
  );
  await SystemConfig.setConfig(
    SecurityConfigKeys.workerVersion,
    SECURITY_WORKER_VERSION,
    'string',
    'security'
  );
  await SystemConfig.setConfig(
    SecurityConfigKeys.workerPid,
    process.pid,
    'number',
    'security'
  );

  // License API health runs even when monitoring is off or emergency bypass is active.
  try {
    const { checkLicenseApiHealth } = await import('./license-health');
    await checkLicenseApiHealth({ retries: 3, retryDelayMs: 2000 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cd-security] License API health check failed:', message);
  }

  // Auto-backup runs independently of security monitoring toggles.
  try {
    const { maybeRunAutoBackup } = await import('@cd-v2/backup');
    await maybeRunAutoBackup();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cd-security] Auto backup check failed:', message);
  }

  if (!enabled) return;

  try {
    await refreshEmergencyState();
    const bypassActive = await isEmergencyBypassActive();

    if (!bypassActive) {
      const baselines = await ensureFileBaselines();
      await runFileIntegrityPass(baselines);
      await runActivityMonitor();
      await runIntrusionPatternScan();
    }

    const { runLicenseIntegrityChecks } = await import('./license-monitor');
    if (!bypassActive) {
      await runLicenseIntegrityChecks();
    }

    const threatLevel = await computeThreatLevel();
    await SystemConfig.setConfig(
      SecurityConfigKeys.threatLevel,
      threatLevel,
      'string',
      'security'
    );
    await SystemConfig.setConfig(SecurityConfigKeys.workerLastError, '', 'string', 'security');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await SystemConfig.setConfig(
      SecurityConfigKeys.workerLastError,
      message,
      'string',
      'security'
    );
    await logSecurityEvent({
      eventType: 'monitor_cycle_error',
      severity: 'high',
      description: `Security worker cycle failed: ${message}`,
      skipDedup: true,
    });
  }
}
