import { Op } from 'sequelize';
import { SecurityEvent } from '@cd-v2/database';
import { logSecurityEvent } from './events';
import { whereCreatedSince } from './sequelize-time';

export type IntrusionPatternName =
  | 'sql_injection'
  | 'xss_attempt'
  | 'path_traversal'
  | 'intrusion_detected';

export type IntrusionHit = {
  name: IntrusionPatternName;
  matched: string;
};

/** High-confidence attack signatures for live HTTP + residual event scans. */
export const INTRUSION_PATTERNS: Array<{ name: IntrusionPatternName; regex: RegExp }> = [
  {
    name: 'sql_injection',
    // High-confidence only — avoid English phrases like "select a date from…".
    regex:
      /(union\s+(all\s+)?select)|(('|\")\s*or\s+['\"]?\d+['\"]?\s*=\s*['\"]?\d+)|;\s*(drop|delete|truncate)\s+(table|database|from)|\binformation_schema\b|(sleep|benchmark)\s*\(|\bload_file\s*\(/i,
  },
  {
    name: 'xss_attempt',
    regex: /<script[\s>]|<\/script>|javascript\s*:|on(error|load|click|mouseover)\s*=/i,
  },
  {
    name: 'path_traversal',
    regex: /\.\.(\/|\\)|%2e%2e(%2f|%5c)|\.\.%2f|\.\.%5c/i,
  },
  {
    name: 'intrusion_detected',
    regex:
      /(\/wp-admin|\/wp-login|\/\.env\b|\/\.git\/|\/phpmyadmin|\/etc\/passwd|\/proc\/self\/environ)/i,
  },
];

export type HttpScanInput = {
  path?: string | null;
  query?: string | null;
  body?: string | null;
};

/**
 * Scan live HTTP path, query, and body for intrusion patterns.
 * Returns the first hit (priority: sql → xss → traversal → generic probe).
 */
export function scanHttpPayload(input: HttpScanInput): IntrusionHit | null {
  const text = [input.path, input.query, input.body]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n');
  if (!text) return null;

  // Cap scan size to avoid CPU spikes on large uploads / imports.
  const sample = text.length > 32_000 ? text.slice(0, 32_000) : text;

  for (const { name, regex } of INTRUSION_PATTERNS) {
    const match = sample.match(regex);
    if (match) {
      return { name, matched: match[0].slice(0, 120) };
    }
  }
  return null;
}

/** Scan recent events' descriptions/details for attack patterns (residual / worker pass). */
export async function runIntrusionPatternScan(): Promise<number> {
  const since = new Date(Date.now() - 10 * 60 * 1000);
  const recent = await SecurityEvent.findAll({
    where: {
      ...whereCreatedSince(since),
      eventType: {
        [Op.notIn]: [
          'sql_injection',
          'xss_attempt',
          'path_traversal',
          'intrusion_detected',
          'bot_detected',
          'threat_detected',
        ],
      },
    },
    attributes: ['id', 'description', 'details', 'eventType'],
    limit: 50,
  });

  let hits = 0;
  for (const ev of recent) {
    const hit = scanHttpPayload({
      body: `${ev.description} ${JSON.stringify(ev.details ?? {})}`,
    });
    if (!hit) continue;
    const created = await logSecurityEvent({
      eventType: hit.name,
      severity: 'high',
      description: `Intrusion pattern detected (${hit.name}) in recent activity`,
      details: { sourceEventId: ev.id, pattern: hit.name, matched: hit.matched },
    });
    if (created) hits++;
  }
  return hits;
}
