#!/usr/bin/env node
/**
 * Production preflight — fail before deploy if secrets are exposed or weak.
 *
 * Usage: npm run preflight:production
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { checkMiniDockSecurity } from './mini-preflight.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function readText(relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

function isTracked(relPath) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', relPath], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0;
}

function loadEnv() {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    fail('.env file is missing — copy .env.example and configure secrets locally.');
    return {};
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const WEAK_JWT = new Set(['', 'supersecretkey', 'your-secret-key-here', 'changeme', 'secret']);
const PLACEHOLDER_PATTERNS = [
  /your-[a-z-]+-here/i,
  /after-regeneration/i,
  /change-in-production/i,
  /^changeme$/i,
  /^secret$/i,
];

function looksPlaceholder(value) {
  const v = String(value ?? '').trim();
  if (!v) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

function scanTrackedSecrets() {
  const trackedSensitive = [
    '.env',
    'cloudflared-computerdynamics.yml',
    'data/mini-dock.json',
    'scripts/tmp-login.json',
    'Management Systems/POS System/POS-2026-05-27-Demo/server/sessions/.session_secret',
  ];

  for (const rel of trackedSensitive) {
    if (isTracked(rel)) {
      fail(`Tracked in git (must be local-only): ${rel}`);
    }
  }

  const ecosystemFiles = spawnSync('git', ['ls-files', '**/ecosystem.config.js'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (ecosystemFiles.status === 0) {
    for (const rel of ecosystemFiles.stdout.split(/\r?\n/).filter(Boolean)) {
      const text = readText(rel);
      if (text && /JWT_SECRET:\s*['"][^'"]+['"]/.test(text) && !text.includes('process.env')) {
        warn(`Hardcoded JWT_SECRET in tracked file: ${rel}`);
      }
    }
  }
}

function checkEnvFile(env) {
  const jwt = env.JWT_SECRET?.trim() ?? '';
  if (!jwt || WEAK_JWT.has(jwt)) {
    fail('JWT_SECRET is missing or uses the dev default — generate a 32+ character random secret.');
  } else if (jwt.length < 32) {
    fail('JWT_SECRET is shorter than 32 characters.');
  }

  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim() ?? '';
  if (!siteUrl || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(siteUrl)) {
    fail('NEXT_PUBLIC_SITE_URL must be your live domain (not localhost).');
  }

  if (env.WIPAY_ENABLED === 'true') {
    if (looksPlaceholder(env.WIPAY_API_KEY)) {
      fail('WIPAY_ENABLED=true but WIPAY_API_KEY is missing or still a placeholder.');
    }
    if (!env.WIPAY_ACCOUNT_NUMBER?.trim()) {
      fail('WIPAY_ENABLED=true but WIPAY_ACCOUNT_NUMBER is missing.');
    }
  }

  if (env.MSP_API_TOKEN?.trim()) {
    warn('MSP_API_TOKEN is set in .env — prefer Settings → Integrations in the portal (env overrides DB).');
  }
}

function checkLicenseActivationEnv(rootEnv = {}) {
  const licEnvPath = path.join(root, 'license_activation_system_new', '.env');
  if (!fs.existsSync(licEnvPath)) {
    fail('license_activation_system_new/.env is missing — copy .env.example and set LICENSE_RESPONSE_SECRET.');
    return;
  }
  const licEnv = {};
  for (const line of fs.readFileSync(licEnvPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const eq = trimmed.indexOf('=');
    licEnv[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
  }
  const responseSecret = licEnv.LICENSE_RESPONSE_SECRET?.trim() ?? '';
  if (!responseSecret || looksPlaceholder(responseSecret)) {
    fail('LICENSE_RESPONSE_SECRET is missing or placeholder in license_activation_system_new/.env');
  } else if (responseSecret.length < 32) {
    fail('LICENSE_RESPONSE_SECRET in license_activation_system_new/.env is shorter than 32 characters.');
  }
  if ((licEnv.FLASK_DEBUG ?? '').toLowerCase() === 'true') {
    fail('FLASK_DEBUG=true in license_activation_system_new/.env — set FLASK_DEBUG=False for production.');
  }
  const licenseDb = path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
  if (!fs.existsSync(licenseDb)) {
    warn('license_activation_system_new/instance/license_system.db not found — create licenses via GUI first.');
  }
  const configuredDb = rootEnv.LICENSE_DB_PATH?.trim();
  if (!configuredDb) {
    warn('LICENSE_DB_PATH not set in root .env — portal will use default license_system.db path.');
  }
}

function checkGitignore() {
  const gitignore = readText('.gitignore') ?? '';
  const required = ['.env', 'scripts/tmp-login.json', 'cloudflared-computerdynamics.yml', 'data/mini-dock.json'];
  for (const entry of required) {
    if (!gitignore.split(/\r?\n/).some((line) => line.trim() === entry)) {
      warn(`.gitignore should include: ${entry}`);
    }
  }
}

function checkLocalArtifacts() {
  if (fs.existsSync(path.join(root, 'scripts', 'tmp-login.json'))) {
    fail('scripts/tmp-login.json exists — delete it (contains test credentials).');
  }

  const tunnelConfig = readText('cloudflared-computerdynamics.yml');
  if (tunnelConfig && /YOUR_TUNNEL/.test(tunnelConfig)) {
    fail('cloudflared-computerdynamics.yml still has placeholder values.');
  }
}

async function checkDatabaseSecrets() {
  const dbPath = path.join(root, 'data', 'computer_dynamics.db');
  if (!fs.existsSync(dbPath)) {
    warn('data/computer_dynamics.db not found — skipping DB secret checks.');
    return;
  }

  let sqlite3;
  try {
    sqlite3 = (await import('sqlite3')).default;
  } catch {
    warn('sqlite3 unavailable — skipping DB secret checks.');
    return;
  }

  const db = new sqlite3.Database(dbPath);
  const rows = await new Promise((resolve, reject) => {
    db.all(
      `SELECT key, value FROM system_configs
       WHERE key IN (
         'email_password',
         'recaptcha_secret_key',
         'wipay_api_key',
         'msp_api_token',
         'mini_api_token',
         'mini_docked'
       )`,
      [],
      (err, result) => (err ? reject(err) : resolve(result))
    );
  });
  db.close();

  for (const row of rows) {
    const value = String(row.value ?? '').trim();
    if (!value) continue;
    if (row.key === 'email_password' && value.length < 4) {
      warn('email_password in DB looks too short — verify SMTP settings.');
    }
    if (row.key === 'recaptcha_secret_key' && value.length < 20) {
      warn('recaptcha_secret_key in DB looks invalid.');
    }
    if (row.key === 'wipay_api_key' && looksPlaceholder(value)) {
      warn('wipay_api_key in DB is empty or placeholder while WiPay may be enabled.');
    }
    if (row.key === 'mini_docked' && value === 'true') {
      const miniToken = rows.find((r) => r.key === 'mini_api_token');
      if (!miniToken?.value || String(miniToken.value).trim().length < 32) {
        fail('mini_docked=true in portal DB but mini_api_token is missing — Save Mini settings in Integrations.');
      }
    }
  }
}

function checkBuildExists() {
  const nextDir = path.join(root, 'apps', 'web', '.next');
  if (!fs.existsSync(nextDir)) {
    warn('Production build not found — run npm run build before npm run start.');
  }
}

// --- run ---
console.log('Computer Dynamics v2 — production preflight\n');

scanTrackedSecrets();
checkGitignore();
checkLocalArtifacts();
const env = loadEnv();
checkEnvFile(env);
checkLicenseActivationEnv(env);
checkMiniDockSecurity(root, { fail, warn, isTracked });
await checkDatabaseSecrets();
checkBuildExists();

console.log('--- Results ---\n');

if (warnings.length) {
  console.log('Warnings:');
  for (const w of warnings) console.log(`  ⚠ ${w}`);
  console.log('');
}

if (errors.length) {
  console.log('Blockers (fix before production):');
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log('\nPreflight FAILED.');
  process.exit(1);
}

console.log('Preflight PASSED — no secret blockers found.');
if (warnings.length) {
  console.log(`(${warnings.length} warning(s) — review above)`);
}
process.exit(0);
