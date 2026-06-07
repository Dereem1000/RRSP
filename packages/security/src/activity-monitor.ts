import { Op } from 'sequelize';
import { SecurityEvent } from '@cd-v2/database';
import { logSecurityEvent } from './events';
import { ORDER_BY_CREATED_DESC, whereCreatedSince } from './sequelize-time';

const FAILED_LOGIN_THRESHOLD = 5;
const EVENT_BURST_THRESHOLD = 15;
const WINDOW_MS = 5 * 60 * 1000;

export async function runActivityMonitor(): Promise<{ alerts: number }> {
  const since = new Date(Date.now() - WINDOW_MS);
  let alerts = 0;

  const recent = await SecurityEvent.findAll({
    where: {
      ...whereCreatedSince(since),
      isActive: true,
      eventType: { [Op.ne]: 'suspicious_activity' },
    },
    order: ORDER_BY_CREATED_DESC,
    limit: 200,
  });

  const failedByUser = new Map<string, number>();
  const volumeByUser = new Map<string, number>();

  for (const ev of recent) {
    const key = String(ev.userId ?? ev.ipAddress ?? 'anonymous');
    if (ev.eventType === 'login_attempt' && ev.outcome === 'blocked') {
      failedByUser.set(key, (failedByUser.get(key) ?? 0) + 1);
    }
    volumeByUser.set(key, (volumeByUser.get(key) ?? 0) + 1);
  }

  for (const [key, count] of failedByUser) {
    if (count >= FAILED_LOGIN_THRESHOLD) {
      const created = await logSecurityEvent({
        eventType: 'suspicious_activity',
        severity: 'high',
        description: `Brute-force pattern: ${count} failed logins in 5 minutes (${key})`,
        details: { pattern: 'brute_force', actorKey: key, count },
      });
      if (created) alerts++;
    }
  }

  for (const [key, count] of volumeByUser) {
    if (count >= EVENT_BURST_THRESHOLD) {
      const created = await logSecurityEvent({
        eventType: 'suspicious_activity',
        severity: 'medium',
        description: `High event volume: ${count} security events in 5 minutes (${key})`,
        details: { pattern: 'event_burst', actorKey: key, count },
      });
      if (created) alerts++;
    }
  }

  return { alerts };
}
