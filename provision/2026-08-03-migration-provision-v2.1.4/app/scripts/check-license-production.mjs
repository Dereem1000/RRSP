#!/usr/bin/env node
/**
 * Quick license activation production checklist (secrets redacted).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const licEnvPath = path.join(root, 'license_activation_system_new', '.env');
const rootEnvPath = path.join(root, '.env');
const crmEnvPath = 'E:\\CRM\\.env';
const dbPath = path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function status(key, value) {
  if (!value) return `${key}: not set`;
  if (/generate-with|your-secret|changeme|change-in-production/i.test(value)) return `${key}: PLACEHOLDER`;
  return `${key}: ok (${value.length} chars)`;
}

console.log('License activation — production checklist\n');

const licEnv = parseEnv(licEnvPath) ?? {};
const rootEnv = parseEnv(rootEnvPath) ?? {};
const crmEnv = parseEnv(crmEnvPath);

console.log('1. License DB');
console.log(fs.existsSync(dbPath) ? `   license_system.db: found` : `   license_system.db: MISSING`);
console.log(`   LICENSE_DB_PATH (portal): ${rootEnv.LICENSE_DB_PATH ?? 'not set in root .env'}`);

console.log('\n2. Secrets');
console.log(`   ${status('LICENSE_RESPONSE_SECRET (license .env)', licEnv.LICENSE_RESPONSE_SECRET)}`);
if (crmEnv) {
  console.log(`   ${status('LICENSE_RESPONSE_SECRET (CRM .env)', crmEnv.LICENSE_RESPONSE_SECRET)}`);
  const match =
    licEnv.LICENSE_RESPONSE_SECRET &&
    crmEnv.LICENSE_RESPONSE_SECRET &&
    licEnv.LICENSE_RESPONSE_SECRET === crmEnv.LICENSE_RESPONSE_SECRET;
  console.log(`   License ↔ CRM secret: ${match ? 'MATCH' : crmEnv.LICENSE_RESPONSE_SECRET ? 'MISMATCH' : 'CRM not configured'}`);
}
const flaskDebug = (licEnv.FLASK_DEBUG ?? 'false').toLowerCase();
console.log(`   FLASK_DEBUG: ${flaskDebug === 'true' ? 'ENABLED (fix before production)' : 'disabled'}`);

console.log('\n3. MSP GUI sync token (portal DB)');
const portalDb = path.join(root, 'data', 'computer_dynamics.db');
if (fs.existsSync(portalDb)) {
  const py = spawnSync(
    'python',
    [
      '-c',
      `import sqlite3; c=sqlite3.connect(${JSON.stringify(portalDb)}); rows=c.execute("SELECT key, length(trim(coalesce(value,''))) FROM system_configs WHERE key IN ('msp_api_token','msp_sync_token')").fetchall(); print(rows)`,
    ],
    { encoding: 'utf8' }
  );
  const text = (py.stdout || '').trim();
  if (text && text !== '[]') console.log(`   ${text}`);
  else console.log('   msp_api_token / msp_sync_token: not in system_configs (configure in Settings → Integrations)');
} else {
  console.log('   portal DB not found');
}

console.log('\n4. Serial migration (dry-run summary)');
const dry = spawnSync('python', ['reconfigure_license_serials.py', '--dry-run'], {
  cwd: path.join(root, 'license_activation_system_new'),
  encoding: 'utf8',
});
const out = (dry.stdout || '') + (dry.stderr || '');
const active = (out.match(/\[ACTIVE/g) || []).length;
const changes = out.split('\n').filter((l) => l.includes('->')).length;
console.log(`   Rows that would change: ${changes} (${active} active — update deployed apps after apply)`);

console.log('\n5. License API health');
const health = spawnSync('curl.exe', ['-s', '-o', 'nul', '-w', '%{http_code}', '-m', '3', 'http://127.0.0.1:5001/health'], {
  encoding: 'utf8',
});
const code = (health.stdout || '').trim();
console.log(code === '200' ? '   http://127.0.0.1:5001/health: OK' : `   http://127.0.0.1:5001/health: not reachable (${code || 'offline'})`);

console.log('');
