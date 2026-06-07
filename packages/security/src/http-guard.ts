import fs from 'fs';
import path from 'path';
import { getMonorepoRoot, SystemConfig } from '@cd-v2/database';
import { logSecurityEvent } from './events';

function getBlockedIpsMirrorPath(): string {
  return path.join(getMonorepoRoot(), 'data', 'security_blocked_ips.json');
}

export type BlockedIpEntry = {
  ip: string;
  reason: string;
  blockedAt: string;
};

export const SecurityHttpKeys = {
  blockedIps: 'security_blocked_ips',
  botCaptchaEnabled: 'bot_captcha_enabled',
  intrusionEnabled: 'intrusion_detection_enabled',
  botEnabled: 'bot_detection_enabled',
  repairEnabled: 'security_repair_enabled',
  repairUseBackups: 'security_repair_use_backups',
} as const;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export async function loadBlockedIps(): Promise<BlockedIpEntry[]> {
  const raw = await SystemConfig.getConfig<BlockedIpEntry[] | string | null>(
    SecurityHttpKeys.blockedIps,
    []
  );
  if (!raw) return [];
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as BlockedIpEntry[];
    } catch {
      return [];
    }
  }
  return raw;
}

async function persistBlockedIps(entries: BlockedIpEntry[]) {
  await SystemConfig.setConfig(SecurityHttpKeys.blockedIps, entries, 'json', 'security');
  try {
    fs.writeFileSync(getBlockedIpsMirrorPath(), JSON.stringify(entries), 'utf8');
  } catch {
    /* mirror optional */
  }
}

export function readBlockedIpsMirror(): BlockedIpEntry[] {
  try {
    const p = getBlockedIpsMirrorPath();
    if (!fs.existsSync(p)) return [];
    return JSON.parse(fs.readFileSync(p, 'utf8')) as BlockedIpEntry[];
  } catch {
    return [];
  }
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  const entries = readBlockedIpsMirror();
  if (entries.some((e) => e.ip === ip)) return true;
  const db = await loadBlockedIps();
  return db.some((e) => e.ip === ip);
}

export async function blockIp(ip: string, reason: string): Promise<void> {
  const entries = await loadBlockedIps();
  if (entries.some((e) => e.ip === ip)) return;
  entries.push({ ip, reason, blockedAt: new Date().toISOString() });
  await persistBlockedIps(entries);
  await logSecurityEvent({
    eventType: 'ip_blocked',
    severity: 'high',
    description: `IP blocked: ${ip} (${reason})`,
    details: { ip, reason },
    skipDedup: true,
  });
}

export async function unblockIp(ip: string): Promise<boolean> {
  const entries = await loadBlockedIps();
  const next = entries.filter((e) => e.ip !== ip);
  if (next.length === entries.length) return false;
  await persistBlockedIps(next);
  return true;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

export type GuardRequestInput = {
  ip: string;
  path: string;
  method: string;
  userAgent?: string | null;
  acceptLanguage?: string | null;
  query?: string;
  honeypot?: string | null;
};

export type GuardResult = {
  allow: boolean;
  reason?: string;
  logType?: 'bot_detected' | 'rate_limited' | 'ip_blocked';
};

export async function scoreBotRequest(input: GuardRequestInput): Promise<number> {
  let score = 0;
  const ua = (input.userAgent ?? '').toLowerCase();
  if (!ua || ua.length < 10) score += 0.3;
  if (/bot|crawler|spider|scraper|curl|wget|python-requests/i.test(ua)) score += 0.5;
  if (!input.acceptLanguage) score += 0.15;
  const q = `${input.path}?${input.query ?? ''}`.toLowerCase();
  if (/\.\.(\/|\\)|union\s+select|<script|wp-admin/i.test(q)) score += 0.6;
  if (input.honeypot?.trim()) score += 1;
  return Math.min(1, score);
}

export async function guardRequest(input: GuardRequestInput): Promise<GuardResult> {
  if (await isIpBlocked(input.ip)) {
    return { allow: false, reason: 'IP blocked', logType: 'ip_blocked' };
  }

  const rateKey = `${input.ip}:${input.path.startsWith('/api/auth') ? 'auth' : 'api'}`;
  const limit = input.path.includes('/auth/login') ? 30 : 120;
  const windowMs = input.path.includes('/auth/login') ? 15 * 60 * 1000 : 60 * 1000;
  if (!checkRateLimit(rateKey, limit, windowMs)) {
    await logSecurityEvent({
      eventType: 'rate_limited',
      severity: 'medium',
      description: `Rate limit exceeded for ${input.ip} on ${input.path}`,
      ipAddress: input.ip,
    });
    return { allow: false, reason: 'Too many requests', logType: 'rate_limited' };
  }

  const botEnabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.botEnabled, true)) !== false;
  if (botEnabled) {
    const score = await scoreBotRequest(input);
    if (score >= 0.7) {
      await logSecurityEvent({
        eventType: 'bot_detected',
        severity: 'high',
        description: `Bot-like request blocked (score ${score.toFixed(2)}) from ${input.ip}`,
        ipAddress: input.ip,
        details: { score, path: input.path, userAgent: input.userAgent },
      });
      if (score >= 0.9) {
        await blockIp(input.ip, 'Automated bot score threshold');
      }
      return { allow: false, reason: 'Request blocked', logType: 'bot_detected' };
    }
  }

  return { allow: true };
}

export async function verifyTurnstileToken(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;
  if (!token?.trim()) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return Boolean(data.success);
  } catch {
    return false;
  }
}
