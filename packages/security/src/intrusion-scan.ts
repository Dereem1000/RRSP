import { Op } from 'sequelize';
import { SecurityEvent } from '@cd-v2/database';
import { logSecurityEvent } from './events';
import { whereCreatedSince } from './sequelize-time';

const PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'sql_injection', regex: /\b(union|select|insert|delete|drop)\b.*\b(from|where|table)\b/i },
  { name: 'xss_attempt', regex: /<script[\s>]/i },
  { name: 'path_traversal', regex: /\.\.(\/|\\)/ },
];

/** Scan recent events' descriptions/details for attack patterns (v1-style IDS lite). */
export async function runIntrusionPatternScan(): Promise<number> {
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const recent = await SecurityEvent.findAll({
    where: whereCreatedSince(since),
    attributes: ['id', 'description', 'details', 'eventType'],
    limit: 50,
  });

  let hits = 0;
  for (const ev of recent) {
    const text = `${ev.description} ${JSON.stringify(ev.details ?? {})}`;
    for (const { name, regex } of PATTERNS) {
      if (!regex.test(text)) continue;
      const created = await logSecurityEvent({
        eventType: name,
        severity: 'high',
        description: `Intrusion pattern detected (${name}) in recent activity`,
        details: { sourceEventId: ev.id, pattern: name },
      });
      if (created) hits++;
      break;
    }
  }
  return hits;
}
