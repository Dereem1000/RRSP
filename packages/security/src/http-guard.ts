import fs from 'fs';
import path from 'path';
import { getMonorepoRoot, SystemConfig } from '@cd-v2/database';
import { SecurityConfigKeys } from './config-keys';
import { logSecurityEvent } from './events';
import { scanHttpPayload } from './intrusion-scan';

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
  dataLeakGuardEnabled: 'data_leak_guard_enabled',
  dataLeakAutoBlockIp: 'data_leak_auto_block_ip',
} as const;

const rateBuckets = new Map<string, { count: number; resetAt: number }>();

/** Paths that must never be blocked by bot/IDS (liveness, cold-start waits). */
const GUARD_SKIP_PREFIXES = ['/api/health', '/health'];

export function shouldSkipRequestGuard(pathname: string): boolean {
  const p = pathname.split('?')[0] || pathname;
  return GUARD_SKIP_PREFIXES.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));
}

/** Local loopback — never permanently IP-block (dev machines hit ::1 / 127.0.0.1). */
export function isLoopbackIp(ip: string): boolean {
  const n = (ip || '').trim().toLowerCase();
  if (!n || n === 'unknown') return false;
  return (
    n === '::1' ||
    n === 'localhost' ||
    n === '127.0.0.1' ||
    n.startsWith('127.') ||
    n === '::ffff:127.0.0.1' ||
    n.endsWith('%lo') // some stacks append zone id
  );
}

/** Fast read of emergency bypass flag (no DB mutation). */
export async function isEmergencyBypassActiveFast(): Promise<boolean> {
  const active =
    (await SystemConfig.getConfig<boolean>(SecurityConfigKeys.emergencyActive, false)) === true;
  if (!active) return false;
  const expires = await SystemConfig.getConfig<string>(SecurityConfigKeys.emergencyExpires, '');
  if (expires && expires !== 'null' && new Date(expires) <= new Date()) return false;
  return true;
}

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

/** Remove loopback entries left from earlier bot probes during local testing. */
export async function purgeLoopbackBlockedIps(): Promise<number> {
  const entries = await loadBlockedIps();
  const next = entries.filter((e) => !isLoopbackIp(e.ip));
  const removed = entries.length - next.length;
  if (removed > 0) await persistBlockedIps(next);
  return removed;
}

export async function isIpBlocked(ip: string): Promise<boolean> {
  if (isLoopbackIp(ip)) return false;
  const entries = readBlockedIpsMirror();
  if (entries.some((e) => e.ip === ip)) return true;
  const db = await loadBlockedIps();
  return db.some((e) => e.ip === ip);
}

export async function blockIp(ip: string, reason: string): Promise<void> {
  if (isLoopbackIp(ip)) return;
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
  body?: string | null;
  honeypot?: string | null;
};

export type GuardLogType =
  | 'bot_detected'
  | 'rate_limited'
  | 'ip_blocked'
  | 'intrusion_detected'
  | 'sql_injection'
  | 'xss_attempt'
  | 'path_traversal';

export type GuardResult = {
  allow: boolean;
  reason?: string;
  logType?: GuardLogType;
};

/** Bot score 0–1. Threshold for block is {@link BOT_BLOCK_THRESHOLD}. */
export const BOT_BLOCK_THRESHOLD = 0.7;
export const BOT_IP_BLOCK_THRESHOLD = 0.9;

export async function scoreBotRequest(input: GuardRequestInput): Promise<number> {
  let score = 0;
  const ua = (input.userAgent ?? '').toLowerCase().trim();

  if (!ua || ua.length < 8) score += 0.35;
  // Explicit bot/crawler labels — enough alone to block (pentest UA "bot").
  if (/\b(bot|crawler|spider|scraper|slurp|headless)\b/i.test(ua)) score += 0.75;
  // CLI / script clients — need a second signal (no Accept-Language, attack path, etc.).
  else if (/curl|wget|python-requests|go-http-client|java\/|libwww|httpclient|aiohttp/i.test(ua)) {
    score += 0.45;
  }

  if (!input.acceptLanguage?.trim()) score += 0.2;

  const q = `${input.path}?${input.query ?? ''}`.toLowerCase();
  if (/\.\.(\/|\\)|union\s+select|<script|wp-admin|\.env\b/i.test(q)) score += 0.6;
  if (input.honeypot?.trim()) score += 1;

  return Math.min(1, score);
}

function bodySampleForScan(body: string | null | undefined): string | null {
  if (!body) return null;
  return body.length > 32_000 ? body.slice(0, 32_000) : body;
}

export async function guardRequest(input: GuardRequestInput): Promise<GuardResult> {
  if (shouldSkipRequestGuard(input.path)) {
    return { allow: true };
  }

  // Blocklist always wins — emergency bypass must not unblock known intruders.
  if (await isIpBlocked(input.ip)) {
    return { allow: false, reason: 'IP blocked', logType: 'ip_blocked' };
  }

  // Emergency bypass pauses HTTP bot / IDS / rate limits only (local maintenance).
  if (await isEmergencyBypassActiveFast()) {
    return { allow: true };
  }

  const rateKey = `${input.ip}:${input.path.startsWith('/api/auth') || input.path.includes('/auth/') ? 'auth' : 'api'}`;
  const isAuth = input.path.includes('/auth/login') || input.path.endsWith('/login');
  const limit = isAuth ? 30 : 120;
  const windowMs = isAuth ? 15 * 60 * 1000 : 60 * 1000;
  if (!checkRateLimit(rateKey, limit, windowMs)) {
    await logSecurityEvent({
      eventType: 'rate_limited',
      severity: 'medium',
      description: `Rate limit exceeded for ${input.ip} on ${input.path}`,
      ipAddress: input.ip,
    });
    return { allow: false, reason: 'Too many requests', logType: 'rate_limited' };
  }

  const intrusionEnabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.intrusionEnabled, true)) !== false;
  if (intrusionEnabled) {
    const hit = scanHttpPayload({
      path: input.path,
      query: input.query,
      body: bodySampleForScan(input.body),
    });
    if (hit) {
      await logSecurityEvent({
        eventType: hit.name,
        severity: 'high',
        description: `Intrusion blocked (${hit.name}) from ${input.ip} on ${input.path}`,
        ipAddress: input.ip,
        userAgent: input.userAgent,
        details: {
          pattern: hit.name,
          matched: hit.matched,
          path: input.path,
          method: input.method,
        },
        outcome: 'blocked',
      });
      await blockIp(
        input.ip,
        `Intrusion signature (${hit.name}): ${hit.matched.slice(0, 80)}`
      );
      return {
        allow: false,
        reason: 'Request blocked',
        logType: hit.name,
      };
    }
  }

  const botEnabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.botEnabled, true)) !== false;
  if (botEnabled) {
    const score = await scoreBotRequest(input);
    if (score >= BOT_BLOCK_THRESHOLD) {
      await logSecurityEvent({
        eventType: 'bot_detected',
        severity: 'high',
        description: `Bot-like request blocked (score ${score.toFixed(2)}) from ${input.ip}`,
        ipAddress: input.ip,
        userAgent: input.userAgent,
        details: { score, path: input.path, userAgent: input.userAgent },
      });
      if (score >= BOT_IP_BLOCK_THRESHOLD) {
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
