#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import os from 'node:os';

export const WEAK_JWT = new Set(['', 'supersecretkey', 'your-secret-key-here', 'changeme', 'secret']);

export const PLACEHOLDER_PATTERNS = [
  /your-[a-z-]+-here/i,
  /after-regeneration/i,
  /change-in-production/i,
  /^changeme$/i,
  /^secret$/i,
  /generate-a-strong-random-secret/i,
];

export function looksPlaceholder(value) {
  const v = String(value ?? '').trim();
  if (!v) return true;
  return PLACEHOLDER_PATTERNS.some((re) => re.test(v));
}

export function readText(root, relPath) {
  const abs = path.join(root, relPath);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, 'utf8');
}

export function fileExists(root, relPath) {
  return fs.existsSync(path.join(root, relPath));
}

export function isTracked(root, relPath) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', relPath], {
    cwd: root,
    encoding: 'utf8',
  });
  return result.status === 0;
}

export function loadEnvFile(root) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return { path: envPath, exists: false, env: {} };

  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return { path: envPath, exists: true, env };
}

export function parseEnvFile(absPath) {
  const env = {};
  if (!fs.existsSync(absPath)) return env;
  for (const line of fs.readFileSync(absPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

export function dbPath(root, env = {}) {
  const configured = env.DATABASE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(root, configured);
  }
  if (env.CD_V2_ROOT?.trim()) {
    return path.join(path.resolve(env.CD_V2_ROOT.trim()), 'data', 'computer_dynamics.db');
  }
  return path.join(root, 'data', 'computer_dynamics.db');
}

export function licenseDbPath(root, env = {}) {
  const configured = env.LICENSE_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(root, configured);
  }
  return path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
}

export async function openSqlite(absPath) {
  const sqlite3 = (await import('sqlite3')).default;
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(absPath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

export function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows ?? []);
    });
  });
}

export function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

export function runNpmAudit(root) {
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: root,
    encoding: 'utf8',
    shell: true,
    timeout: 120_000,
  });
  if (!result.stdout?.trim()) {
    return { ok: false, error: result.stderr?.trim() || 'npm audit produced no output', data: null };
  }
  try {
    return { ok: true, error: null, data: JSON.parse(result.stdout) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      data: null,
    };
  }
}

export function hostname() {
  return os.hostname();
}

export function timestampSlug(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}
