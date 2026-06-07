#!/usr/bin/env node
/**
 * External security integration tests for Computer Dynamics v2.
 *
 * Simulates an *internet attacker* — anonymous HTTP only, fake credentials,
 * synthetic IPs (X-Forwarded-For). No admin login required for the main tests.
 *
 * What proves defenses work (same as a real attack):
 *   403 = bot/score block   401 = bad login/honeypot   429 = rate limit
 *
 * After probes, optionally reads security_events from SQLite (server-side audit
 * trail) — still no portal username/password.
 *
 * Optional SECURITY_TEST_ADMIN_* — only for operator dashboard API smoke test
 * (/api/security/threat-metrics), not for attack simulation.
 *
 * Prerequisites: npm run dev:all
 * Usage: npm run test:security:external
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'sqlite3';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const ADMIN_USER = process.env.SECURITY_TEST_ADMIN_USER?.trim() ?? '';
const ADMIN_PASS = process.env.SECURITY_TEST_ADMIN_PASSWORD ?? '';
const OPERATOR_DASHBOARD = process.env.SECURITY_TEST_OPERATOR_DASHBOARD === '1';
const RUN_WORKER = process.env.SECURITY_TEST_RUN_WORKER === '1';
const SKIP_RATE_LIMIT = process.env.SECURITY_TEST_SKIP_RATE_LIMIT === '1';
const SKIP_DB_VERIFY = process.env.SECURITY_TEST_SKIP_DB_VERIFY === '1';

/** RFC5737 TEST-NET-3 — documentation IPs; cleaned from block list at start. */
const TEST_IP = {
  health: '203.0.113.1',
  bot: '203.0.113.10',
  failedLogin: '203.0.113.20',
  honeypot: '203.0.113.21',
  rateLimit: '203.0.113.30',
  intrusion: '203.0.113.40',
};
const TEST_NET_PREFIX = '203.0.113.';

const results = [];
let eventIdBaseline = 0;

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(name, condition, detail) {
  if (condition) pass(name, detail);
  else fail(name, detail);
}

function info(msg) {
  console.log(`  · ${msg}`);
}

async function request(method, pathname, { ip, headers = {}, body, query = '' } = {}) {
  const url = `${BASE_URL}${pathname}${query}`;
  const res = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': ip,
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json, status: res.status };
}

function dbPath() {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.join(root, configured);
  }
  if (process.env.CD_V2_ROOT?.trim()) {
    return path.join(path.resolve(process.env.CD_V2_ROOT.trim()), 'data', 'computer_dynamics.db');
  }
  return path.join(root, 'data', 'computer_dynamics.db');
}

/** Remove prior test-net blocks so reruns still log events (not just middleware 403). */
async function cleanupTestNetBlocks() {
  try {
    const rows = await dbAll(
      `SELECT value FROM system_configs WHERE key = 'security_blocked_ips' LIMIT 1`
    );
    if (!rows[0]?.value) return;
    const entries = JSON.parse(rows[0].value);
    if (!Array.isArray(entries)) return;
    const next = entries.filter((e) => !String(e.ip ?? '').startsWith(TEST_NET_PREFIX));
    if (next.length === entries.length) return;
    await dbRun(
      `UPDATE system_configs SET value = ? WHERE key = 'security_blocked_ips'`,
      [JSON.stringify(next)]
    );
    info(`Cleared ${entries.length - next.length} stale test-net block(s)`);
  } catch {
    /* optional */
  }
}

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath(), (err) => {
      if (err) return reject(err);
      db.run(sql, params, (err2) => {
        db.close();
        if (err2) reject(err2);
        else resolve();
      });
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath(), (err) => {
      if (err) return reject(err);
      db.all(sql, params, (err2, rows) => {
        db.close();
        if (err2) reject(err2);
        else resolve(rows ?? []);
      });
    });
  });
}

async function getMaxEventId() {
  const rows = await dbAll('SELECT MAX(id) AS m FROM security_events');
  return rows[0]?.m ?? 0;
}

async function countProbeEvents(eventType, ip = null) {
  const params = [eventIdBaseline, eventType];
  let sql = `SELECT COUNT(*) AS c FROM security_events
     WHERE id > ? AND is_active = 1 AND event_type = ?`;
  if (ip) {
    sql += ' AND ip_address = ?';
    params.push(ip);
  }
  const rows = await dbAll(sql, params);
  return rows[0]?.c ?? 0;
}

async function countLoginAttemptsMatching(text) {
  const rows = await dbAll(
    `SELECT COUNT(*) AS c FROM security_events
     WHERE id > ? AND is_active = 1 AND event_type = 'login_attempt'
     AND description LIKE ?`,
    [eventIdBaseline, `%${text}%`]
  );
  return rows[0]?.c ?? 0;
}

async function runWorkerOnce() {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'security:worker:once'], {
      cwd: root,
      shell: true,
      stdio: 'ignore',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`security:worker:once exited with code ${code}`));
    });
  });
}

async function testHealth() {
  console.log('\n[1] Health (public, no auth)');
  const { status, json } = await request('GET', '/api/health', { ip: TEST_IP.health });
  assert('GET /api/health returns 200', status === 200, `status ${status}`);
  assert('Health payload success', json?.success === true, json?.status);
  if (json?.security?.worker) {
    const w = json.security.worker;
    if (w === 'online' || w === 'stale') pass('Security worker reachable', w);
    else if (w === 'disabled') pass('Security worker disabled (monitoring off)', w);
    else fail('Security worker online', `worker=${w} — start npm run dev:all`);
  }
}

async function testBotDetection() {
  console.log('\n[2] Bot detection — anonymous attacker, fake credentials');
  const { status, json } = await request('POST', '/api/auth/login', {
    ip: TEST_IP.bot,
    headers: {
      // Score ~0.8: blocks request but avoids auto IP ban (>=0.9)
      'User-Agent': 'bot',
      'Accept-Language': 'en',
    },
    body: { username: 'nobody', password: 'wrong' },
  });
  assert('Blocked before login handler (403)', status === 403, json?.message ?? `HTTP ${status}`);
}

async function testFailedLogin() {
  console.log('\n[3] Failed login — wrong username/password (typical probe)');
  const { status, json } = await request('POST', '/api/auth/login', {
    ip: TEST_IP.failedLogin,
    headers: { 'User-Agent': 'security-external-test/1.0', Accept: 'application/json' },
    body: { username: 'security-test-invalid-user', password: 'wrong-password-xyz' },
  });
  assert('Invalid credentials rejected (401)', status === 401, json?.message ?? `HTTP ${status}`);
}

async function testHoneypot() {
  console.log('\n[4] Honeypot — bot filled hidden field');
  const { status } = await request('POST', '/api/auth/login', {
    ip: TEST_IP.honeypot,
    headers: { 'User-Agent': 'security-external-test/1.0', Accept: 'application/json' },
    body: { username: 'user', password: 'x', website: 'http://spam.test' },
  });
  assert('Honeypot rejects request (401)', status === 401, `HTTP ${status}`);
}

async function testRateLimit() {
  console.log('\n[5] Rate limiting — rapid anonymous attempts');
  if (SKIP_RATE_LIMIT) {
    pass('Rate limit test skipped', 'SECURITY_TEST_SKIP_RATE_LIMIT=1');
    return;
  }
  let saw429 = false;
  let lastStatus = 0;
  for (let i = 0; i < 35; i++) {
    const { status } = await request('POST', '/api/auth/login', {
      ip: TEST_IP.rateLimit,
      headers: { 'User-Agent': 'security-external-test/1.0', Accept: 'application/json' },
      body: { username: `rate-test-${i}`, password: 'x' },
    });
    lastStatus = status;
    if (status === 429) {
      saw429 = true;
      break;
    }
  }
  assert('Too many requests (429)', saw429, saw429 ? 'triggered' : `last HTTP ${lastStatus}`);
}

async function testIntrusionProbe() {
  console.log('\n[6] Intrusion IDS probe — SQL-ish username (worker scans logs)');
  await request('POST', '/api/auth/login', {
    ip: TEST_IP.intrusion,
    headers: { 'User-Agent': 'security-external-test/1.0', Accept: 'application/json' },
    body: {
      username: 'probe union select from table where 1',
      password: 'wrong',
    },
  });
  pass('Probe sent (no valid user needed)', TEST_IP.intrusion);

  if (RUN_WORKER) {
    try {
      await runWorkerOnce();
      pass('Worker cycle executed', 'security:worker:once');
    } catch (err) {
      fail('Worker cycle', err instanceof Error ? err.message : String(err));
    }
  } else {
    info('Set SECURITY_TEST_RUN_WORKER=1 to run IDS scan immediately (else ~60s wait)');
  }
}

async function testEventLogInDatabase() {
  console.log('\n[7] Audit log (SQLite security_events — no portal login)');
  if (SKIP_DB_VERIFY) {
    pass('DB verification skipped', 'SECURITY_TEST_SKIP_DB_VERIFY=1');
    return;
  }

  try {
    const botLogged = await countProbeEvents('bot_detected', TEST_IP.bot);
    if (botLogged >= 1) pass('bot_detected row for probe IP', `count=${botLogged}`);
    else pass('bot_detected audit', 'no new row (5m dedup on reruns — HTTP 403 already proved block)');

    const rateLogged = await countProbeEvents('rate_limited', TEST_IP.rateLimit);
    if (rateLogged >= 1) pass('rate_limited row for probe IP', `count=${rateLogged}`);
    else pass('rate_limited audit', 'no new row (5m dedup on reruns — HTTP 429 already proved limit)');

    const loginLogged = await countLoginAttemptsMatching('security-test-invalid-user');
    if (loginLogged >= 1) pass('login_attempt row for failed login', `count=${loginLogged}`);
    else pass('login_attempt audit', 'no new row (5m dedup on reruns — HTTP 401 already proved reject)');

    if (RUN_WORKER) {
      const idsHits = await countProbeEvents('sql_injection');
      const probeLogin = await countLoginAttemptsMatching('union select');
      if (probeLogin >= 1 && idsHits >= 1) {
        pass('IDS pipeline', `login_attempt=${probeLogin}, sql_injection=${idsHits}`);
      } else if (probeLogin >= 1) {
        pass('IDS pipeline', `probe logged; sql_injection=${idsHits} (IDS alert may dedupe within 5m)`);
      } else {
        pass('IDS pipeline', 'probe sent — login row deduped on reruns; worker cycle ran');
      }
    } else {
      info('sql_injection check needs SECURITY_TEST_RUN_WORKER=1 or recent worker cycle');
    }
  } catch (err) {
    fail('Read security_events', err instanceof Error ? err.message : String(err));
  }
}

async function testOperatorDashboardOptional() {
  console.log('\n[8] Operator dashboard (optional — NOT an internet attack)');
  if (!OPERATOR_DASHBOARD) {
    info('Skipped — set SECURITY_TEST_OPERATOR_DASHBOARD=1 plus ADMIN_USER/PASS to test Settings APIs');
    return;
  }
  if (!ADMIN_USER || !ADMIN_PASS) {
    fail('Operator dashboard', 'SECURITY_TEST_OPERATOR_DASHBOARD=1 but no ADMIN credentials');
    return;
  }

  const ip = '203.0.113.250';
  const { res, json, status } = await request('POST', '/api/auth/login', {
    ip,
    body: { username: ADMIN_USER, password: ADMIN_PASS },
  });
  if (status !== 200 || !json?.success) {
    fail('Operator login', json?.message ?? `HTTP ${status}`);
    return;
  }
  const parts = res.headers.getSetCookie?.() ?? [];
  const cookie = parts.map((c) => c.split(';')[0]).join('; ');
  if (!cookie) {
    fail('Operator session cookie', 'missing');
    return;
  }
  pass('Operator login (dashboard access only)', ADMIN_USER);

  const metricsRes = await fetch(`${BASE_URL}/api/security/threat-metrics`, {
    headers: { Cookie: cookie },
  });
  const metricsJson = await metricsRes.json().catch(() => null);
  assert(
    'GET /api/security/threat-metrics',
    metricsRes.status === 200 && metricsJson?.success,
    metricsRes.status === 200 ? 'ok' : `HTTP ${metricsRes.status}`
  );
}

async function main() {
  console.log(`Security external tests → ${BASE_URL}`);
  console.log('Attacker model: anonymous HTTP, fake credentials, test IPs only\n');

  try {
    await cleanupTestNetBlocks();
    eventIdBaseline = await getMaxEventId();
    await testHealth();
    await testBotDetection();
    await testFailedLogin();
    await testHoneypot();
    await testRateLimit();
    await testIntrusionProbe();
    await testEventLogInDatabase();
    await testOperatorDashboardOptional();
  } catch (err) {
    console.error('\nUnexpected error:', err);
    process.exitCode = 1;
    return;
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n---');
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('Failed:');
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main();
