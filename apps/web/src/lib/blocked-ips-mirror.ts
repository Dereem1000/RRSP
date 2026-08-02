import fs from 'fs';
import path from 'path';

function mirrorPath(): string {
  const root = process.env.CD_V2_ROOT?.trim();
  if (root) return path.join(path.resolve(root), 'data', 'security_blocked_ips.json');
  return path.join(process.cwd(), 'data', 'security_blocked_ips.json');
}

function isLoopbackIp(ip: string): boolean {
  const n = (ip || '').trim().toLowerCase();
  if (!n || n === 'unknown') return false;
  return (
    n === '::1' ||
    n === 'localhost' ||
    n === '127.0.0.1' ||
    n.startsWith('127.') ||
    n === '::ffff:127.0.0.1'
  );
}

export function isIpBlockedSync(ip: string): boolean {
  if (isLoopbackIp(ip)) return false;
  try {
    const p = mirrorPath();
    if (!fs.existsSync(p)) return false;
    const entries = JSON.parse(fs.readFileSync(p, 'utf8')) as Array<{ ip: string }>;
    return entries.some((e) => e.ip === ip);
  } catch {
    return false;
  }
}
