import { Op } from 'sequelize';
import { Client, SecurityEvent, SystemConfig } from '@cd-v2/database';
import {
  ACTIVITY_WINDOW_MS,
  EVENT_BURST_THRESHOLD,
  FAILED_LOGIN_THRESHOLD,
} from './activity-thresholds';
import { SecurityConfigKeys } from './config-keys';
import { checkFileIntegrity, getProtectedFilePaths } from './protected-files';
import { ensureFileBaselines, computeThreatLevel } from './monitoring';
import { isEmergencyBypassActive } from './emergency';
import { loadBlockedIps } from './http-guard';
import { eventCreatedAt, whereCreatedSince } from './sequelize-time';
import type { ThreatLevel } from './types';

const LICENSE_ACTIVATION_BURST = 10;
const LICENSE_VALIDATION_FAIL_BURST = 50;
const LICENSE_BURST_WINDOW_MIN = 5;

export type ReconcileSecurityEventsResult = {
  cleared: number;
  remaining: number;
  threatLevel: ThreatLevel;
  previousThreatLevel: ThreatLevel;
  clearedByType: Record<string, number>;
};

function eventCreatedMs(event: SecurityEvent): number | null {
  const raw = eventCreatedAt(event);
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function isOutsideWindow(event: SecurityEvent, windowMs: number): boolean {
  const ms = eventCreatedMs(event);
  if (ms === null) return false;
  return Date.now() - ms > windowMs;
}

function extractProtectedPath(event: SecurityEvent): string | null {
  const details = (event.details ?? {}) as Record<string, unknown>;
  if (typeof details.relativePath === 'string') return details.relativePath;

  const patterns = [
    /Protected file changed: (.+?) \(/,
    /File repair attempted: (.+?) \(/,
    /File repair failed: (.+?)(?:\s*\(|$)/,
    /File restored from backup: (.+)$/,
  ];
  for (const pattern of patterns) {
    const match = event.description.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function isProtectedFileEventResolved(event: SecurityEvent): Promise<boolean> {
  const rel = extractProtectedPath(event);
  if (!rel) return false;
  // Catalog removed this path (e.g. old per-route files after [[...path]] consolidation).
  if (!getProtectedFilePaths().includes(rel)) return true;
  const baselines = await ensureFileBaselines();
  const baseline = baselines[rel];
  if (!baseline) return false;
  return checkFileIntegrity(rel, baseline).ok;
}

function actorWhereClause(actorKey: string): Record<string, unknown> {
  if (actorKey === 'anonymous') {
    return { userId: { [Op.is]: null }, ipAddress: { [Op.is]: null } };
  }
  const userId = Number(actorKey);
  if (!Number.isNaN(userId) && String(userId) === actorKey) {
    return { userId };
  }
  return { ipAddress: actorKey };
}

async function isBruteForceActive(actorKey: string): Promise<boolean> {
  if (actorKey === 'anonymous') return false;
  const since = new Date(Date.now() - ACTIVITY_WINDOW_MS);
  const count = await SecurityEvent.count({
    where: {
      ...whereCreatedSince(since),
      isActive: true,
      eventType: 'login_attempt',
      outcome: 'blocked',
      ...actorWhereClause(actorKey),
    },
  });
  return count >= FAILED_LOGIN_THRESHOLD;
}

async function isEventBurstActive(actorKey: string): Promise<boolean> {
  if (actorKey === 'anonymous') return false;
  const since = new Date(Date.now() - ACTIVITY_WINDOW_MS);
  const count = await SecurityEvent.count({
    where: {
      ...whereCreatedSince(since),
      isActive: true,
      eventType: { [Op.ne]: 'suspicious_activity' },
      ...actorWhereClause(actorKey),
    },
  });
  return count >= EVENT_BURST_THRESHOLD;
}

async function isSuspiciousActivityResolved(event: SecurityEvent): Promise<boolean> {
  const details = (event.details ?? {}) as Record<string, unknown>;
  const pattern = details.pattern as string | undefined;
  const actorKey = typeof details.actorKey === 'string' ? details.actorKey : null;

  if (pattern === 'brute_force' && actorKey) {
    if (isOutsideWindow(event, ACTIVITY_WINDOW_MS)) return true;
    return !(await isBruteForceActive(actorKey));
  }

  if (pattern === 'event_burst' && actorKey) {
    if (isOutsideWindow(event, ACTIVITY_WINDOW_MS)) return true;
    return !(await isEventBurstActive(actorKey));
  }

  return isOutsideWindow(event, ACTIVITY_WINDOW_MS);
}

function loginAttemptActorKey(event: SecurityEvent): string {
  if (event.userId != null) return String(event.userId);
  if (event.ipAddress) return event.ipAddress;
  return 'anonymous';
}

async function isLoginAttemptResolved(event: SecurityEvent): Promise<boolean> {
  if (event.outcome === 'success') return true;
  if (event.outcome === 'blocked') {
    return !(await isBruteForceActive(loginAttemptActorKey(event)));
  }
  return isOutsideWindow(event, ACTIVITY_WINDOW_MS);
}

async function isSystemChangeResolved(event: SecurityEvent): Promise<boolean> {
  if (event.outcome !== 'allowed') return false;
  if (
    event.description.includes('baselines refreshed') ||
    event.description.includes('monitoring enabled') ||
    event.description.includes('File integrity baselines auto-updated')
  ) {
    return true;
  }
  return isOutsideWindow(event, 24 * 60 * 60 * 1000);
}

async function isLicenseMspMismatchResolved(event: SecurityEvent): Promise<boolean> {
  const details = (event.details ?? {}) as Record<string, unknown>;
  const serial = typeof details.serial === 'string' ? details.serial : null;
  const mspClientId = typeof details.mspClientId === 'string' ? details.mspClientId : null;
  const clientId = typeof details.clientId === 'string' ? details.clientId : null;

  const db = await import('./license-db');
  const licenses = await db.queryLicenseActivations();
  const license = serial ? licenses.find((row) => row.serial_number === serial) : null;

  if (serial && !license) return true;

  if (mspClientId && event.description.includes('unknown MSP client')) {
    const client = await Client.findByPk(mspClientId, { attributes: ['id'] });
    return client !== null;
  }

  if (clientId && license && event.description.includes('inactive MSP client')) {
    const client = await Client.findByPk(clientId, { attributes: ['id', 'isActive', 'status'] });
    if (!client) return true;
    const clientLive = Boolean(client.isActive) || client.status === 'active';
    return !license.is_active || clientLive;
  }

  return false;
}

async function isEventResolved(event: SecurityEvent): Promise<boolean> {
  const details = (event.details ?? {}) as Record<string, unknown>;
  const pattern = details.pattern as string | undefined;

  switch (event.eventType) {
    case 'license_integrity':
      if (
        pattern === 'expired_but_active' ||
        pattern === 'expired_but_active_auto_fixed' ||
        pattern === 'inactive_client_auto_fixed' ||
        event.description.includes('marked active but past expiration') ||
        event.description.includes('Auto-deactivated')
      ) {
        const db = await import('./license-db');
        if (pattern === 'inactive_client_auto_fixed') {
          return true;
        }
        await db.deactivateExpiredActiveLicenses();
        return (await db.countExpiredButActive()) === 0;
      }
      return false;

    case 'license_api_offline': {
      const { checkLicenseApiHealth } = await import('./license-health');
      const health = await checkLicenseApiHealth({ logOffline: false });
      return health.status === 'online' || health.status === 'disabled';
    }

    case 'file_integrity':
    case 'file_repair_failed':
    case 'file_repair_attempted':
    case 'file_repair_succeeded':
      return isProtectedFileEventResolved(event);

    case 'suspicious_license_activity':
      if (pattern === 'activation_burst') {
        const db = await import('./license-db');
        return (await db.countRecentActivations(LICENSE_BURST_WINDOW_MIN)) < LICENSE_ACTIVATION_BURST;
      }
      if (pattern === 'validation_fail_burst') {
        const db = await import('./license-db');
        return (
          (await db.countRecentValidationFailures(LICENSE_BURST_WINDOW_MIN)) <
          LICENSE_VALIDATION_FAIL_BURST
        );
      }
      return isOutsideWindow(event, ACTIVITY_WINDOW_MS);

    case 'license_msp_mismatch':
      return isLicenseMspMismatchResolved(event);

    case 'monitor_cycle_error': {
      const lastError = await SystemConfig.getConfig<string | null>(
        SecurityConfigKeys.workerLastError,
        null
      );
      return !lastError || lastError === '' || lastError === 'null';
    }

    case 'suspicious_activity':
      return isSuspiciousActivityResolved(event);

    case 'login_attempt':
      return isLoginAttemptResolved(event);

    case 'system_change':
      return isSystemChangeResolved(event);

    case 'emergency_override':
      return !(await isEmergencyBypassActive());

    case 'admin_login':
      return event.outcome === 'success' || isOutsideWindow(event, 24 * 60 * 60 * 1000);

    case 'intrusion_detected':
    case 'bot_detected':
    case 'threat_detected':
    case 'sql_injection':
    case 'xss_attempt':
    case 'path_traversal':
      return isOutsideWindow(event, ACTIVITY_WINDOW_MS);

    case 'ip_blocked': {
      const ip = event.ipAddress?.trim();
      if (!ip) return isOutsideWindow(event, 24 * 60 * 60 * 1000);
      const blocked = await loadBlockedIps();
      return blocked.some((e) => e.ip === ip) || isOutsideWindow(event, 24 * 60 * 60 * 1000);
    }

    case 'license_validate_failed':
    case 'license_validate_success':
    case 'license_validate_blocked':
      return isOutsideWindow(event, ACTIVITY_WINDOW_MS);

    default:
      return false;
  }
}

export async function reconcileSecurityEvents(): Promise<ReconcileSecurityEventsResult> {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const previousThreatLevel =
    ((await SystemConfig.getConfig<string>(SecurityConfigKeys.threatLevel, 'low')) as ThreatLevel) ||
    'low';

  const events = await SecurityEvent.findAll({
    where: { ...whereCreatedSince(since24h), isActive: true },
    order: [['created_at', 'DESC']],
  });

  const toClear: number[] = [];
  const clearedByType: Record<string, number> = {};

  for (const event of events) {
    try {
      if (await isEventResolved(event)) {
        toClear.push(event.id);
        clearedByType[event.eventType] = (clearedByType[event.eventType] ?? 0) + 1;
      }
    } catch {
      // Keep active when a resolver fails unexpectedly.
    }
  }

  if (toClear.length > 0) {
    await SecurityEvent.update({ isActive: false }, { where: { id: { [Op.in]: toClear } } });
  }

  const threatLevel = await computeThreatLevel();
  await SystemConfig.setConfig(
    SecurityConfigKeys.threatLevel,
    threatLevel,
    'string',
    'security'
  );

  const remaining = await SecurityEvent.count({
    where: { ...whereCreatedSince(since24h), isActive: true },
  });

  return {
    cleared: toClear.length,
    remaining,
    threatLevel,
    previousThreatLevel,
    clearedByType,
  };
}
