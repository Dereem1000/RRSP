import { SecurityEvent } from '@cd-v2/database';

const recentFingerprints = new Map<string, number>();
const DEDUP_MS = 5 * 60 * 1000;

function fingerprint(eventType: string, description: string): string {
  return `${eventType}:${description.slice(0, 120)}`;
}

function shouldSkipDuplicate(eventType: string, description: string): boolean {
  const key = fingerprint(eventType, description);
  const last = recentFingerprints.get(key);
  const now = Date.now();
  if (last && now - last < DEDUP_MS) return true;
  recentFingerprints.set(key, now);
  if (recentFingerprints.size > 500) {
    for (const [k, t] of recentFingerprints) {
      if (now - t > DEDUP_MS) recentFingerprints.delete(k);
    }
  }
  return false;
}

export async function logSecurityEvent(input: {
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  userId?: number | null;
  details?: Record<string, unknown>;
  outcome?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  skipDedup?: boolean;
}) {
  if (
    !input.skipDedup &&
    shouldSkipDuplicate(input.eventType, input.description)
  ) {
    return null;
  }

  return SecurityEvent.create({
    eventType: input.eventType,
    severity: input.severity,
    userId: input.userId ?? null,
    description: input.description,
    details: { ...input.details, source: 'cd-v2-security' },
    outcome: input.outcome ?? 'monitored',
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
    isActive: true,
  });
}
