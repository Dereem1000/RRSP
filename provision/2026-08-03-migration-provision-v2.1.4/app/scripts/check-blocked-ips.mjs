import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';

/** Inspect blocked-IP list and ip_blocked events. Usage: node scripts/check-blocked-ips.mjs */

const root = path.resolve(import.meta.dirname, '..');
const dbPath = path.join(root, 'data', 'computer_dynamics.db');
const mirrorPath = path.join(root, 'data', 'security_blocked_ips.json');

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) return reject(err);
      db.all(sql, params, (e, rows) => {
        db.close();
        e ? reject(e) : resolve(rows ?? []);
      });
    });
  });
}

const blockedConfig = await dbAll(
  `SELECT value FROM system_configs WHERE key = 'security_blocked_ips'`
);
console.log('=== system_configs security_blocked_ips (Blocked IPs in UI) ===');
try {
  const parsed = JSON.parse(blockedConfig[0]?.value ?? '[]');
  console.log(JSON.stringify(parsed, null, 2));
  console.log('count:', parsed.length);
} catch {
  console.log(blockedConfig[0]?.value ?? '(empty)');
}

console.log('\n=== data/security_blocked_ips.json mirror (middleware) ===');
if (fs.existsSync(mirrorPath)) {
  const mirror = JSON.parse(fs.readFileSync(mirrorPath, 'utf8'));
  console.log(JSON.stringify(mirror, null, 2));
  console.log('count:', mirror.length);
} else {
  console.log('(file missing until first block)');
}

const ipBlocked24h = await dbAll(
  `SELECT COUNT(*) AS c FROM security_events
   WHERE is_active = 1 AND event_type = 'ip_blocked'
   AND datetime(created_at) >= datetime('now', '-1 day')`
);
console.log('\n=== ip_blocked events (IPs blocked 24h in UI) ===');
console.log('count:', ipBlocked24h[0]?.c ?? 0);

const botDetected24h = await dbAll(
  `SELECT COUNT(*) AS c FROM security_events
   WHERE is_active = 1 AND event_type = 'bot_detected'
   AND datetime(created_at) >= datetime('now', '-1 day')`
);
console.log('\n=== bot_detected events (24h) — blocked request, not permanent ban ===');
console.log('count:', botDetected24h[0]?.c ?? 0);

const recent = await dbAll(
  `SELECT id, event_type, ip_address, description, created_at FROM security_events
   WHERE is_active = 1 AND event_type IN ('ip_blocked', 'bot_detected')
   ORDER BY id DESC LIMIT 10`
);
console.log('\n=== recent bot_detected / ip_blocked ===');
console.log(JSON.stringify(recent, null, 2));
