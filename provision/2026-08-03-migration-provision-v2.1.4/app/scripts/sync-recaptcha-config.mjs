/**
 * Sync Google reCAPTCHA keys into system_configs (portal DB).
 *
 * Usage (from repo root):
 *   node scripts/sync-recaptcha-config.mjs
 *   node scripts/sync-recaptcha-config.mjs --site-key=... --secret-key=...
 *
 * Or set RECAPTCHA_SITE_KEY and RECAPTCHA_SECRET_KEY in the environment.
 */
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const portalDb = path.join(root, 'data', 'computer_dynamics.db');

const DEFAULT_SITE_KEY = '6Ld4N_krAAAAAHKQTbHareULI0Vf9GUJ9AGvqTdU';

function arg(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

const siteKey = arg('site-key') || process.env.RECAPTCHA_SITE_KEY?.trim() || DEFAULT_SITE_KEY;
const secretKey = arg('secret-key') || process.env.RECAPTCHA_SECRET_KEY?.trim();

if (!secretKey) {
  console.error('Missing secret key. Pass --secret-key=... or set RECAPTCHA_SECRET_KEY.');
  process.exit(1);
}

function openDb(p) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(p, (err) => (err ? reject(err) : resolve(db)));
  });
}

function run(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

async function upsertConfig(db, key, value, type = 'string', category = 'security') {
  const existing = await new Promise((resolve, reject) => {
    db.get('SELECT id FROM system_configs WHERE key = ?', [key], (err, row) =>
      err ? reject(err) : resolve(row)
    );
  });

  if (existing) {
    await run(
      db,
      `UPDATE system_configs SET value = ?, type = ?, category = ?, is_active = 1 WHERE key = ?`,
      [String(value), type, category, key]
    );
    return;
  }

  await run(
    db,
    `INSERT INTO system_configs (key, value, type, category, is_active, is_editable, is_public, requires_restart)
     VALUES (?, ?, ?, ?, 1, 1, 0, 0)`,
    [key, String(value), type, category]
  );
}

async function verifySecret(secret) {
  const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ secret, response: 'test-token' }),
  });
  const data = await res.json();
  const codes = data['error-codes'] ?? [];
  if (codes.includes('invalid-input-secret')) {
    throw new Error('Google rejected the secret key (invalid-input-secret).');
  }
  return codes;
}

async function main() {
  console.log('Verifying secret with Google siteverify…');
  const codes = await verifySecret(secretKey);
  console.log('Secret accepted by Google (expected invalid-input-response):', codes.join(', '));

  const db = await openDb(portalDb);
  try {
    await upsertConfig(db, 'recaptcha_site_key', siteKey, 'string');
    await upsertConfig(db, 'recaptcha_secret_key', secretKey, 'string');
    await upsertConfig(db, 'bot_captcha_enabled', 'true', 'boolean');
    await upsertConfig(db, 'captcha_enabled', 'true', 'boolean');
    console.log('Saved recaptcha_site_key, recaptcha_secret_key, bot_captcha_enabled, captcha_enabled');
    console.log('Site key preview:', `${siteKey.slice(0, 8)}…${siteKey.slice(-4)}`);
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
