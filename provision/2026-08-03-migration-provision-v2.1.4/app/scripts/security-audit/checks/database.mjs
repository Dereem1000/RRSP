#!/usr/bin/env node
import fs from 'node:fs';
import {
  dbPath,
  licenseDbPath,
  loadEnvFile,
  openSqlite,
  dbAll,
  closeDb,
  looksPlaceholder,
} from '../lib/utils.mjs';

const CONFIG_KEYS = [
  'developer_mode',
  'ai_security_enabled',
  'emergency_override_active',
  'emergency_override_expires',
  'security_threat_level',
  'intrusion_detection_enabled',
  'bot_detection_enabled',
  'security_repair_enabled',
  'recaptcha_enabled',
  'recaptcha_secret_key',
  'recaptcha_site_key',
  'msp_api_token',
  'mini_api_token',
  'mini_docked',
  'wipay_api_key',
  'email_password',
  'security_worker_last_heartbeat',
  'security_file_baselines_version',
];

export async function runDatabaseChecks(ctx) {
  const checkId = 'database-security';
  const { root } = ctx;
  let issues = 0;

  const { env } = loadEnvFile(root);
  const mainDb = dbPath(root, env);

  if (!fs.existsSync(mainDb)) {
    ctx.recordCheck(checkId, 'Database security posture', 'skipped', 'Main DB not found');
    return;
  }

  let db;
  try {
    db = await openSqlite(mainDb);
    const rows = await dbAll(
      db,
      `SELECT key, value FROM system_configs WHERE key IN (${CONFIG_KEYS.map(() => '?').join(',')})`,
      CONFIG_KEYS
    );
    const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));

    if (cfg.developer_mode === 'true') {
      ctx.finding({
        severity: 'high',
        category: 'database',
        title: 'developer_mode enabled in production DB',
        description:
          'developer_mode=true allows disabling security monitoring with authorization code — should be false in production.',
        remediation: 'Set developer_mode=false in system_configs (Settings or direct DB update).',
        checkId: `${checkId}-developer-mode`,
      });
      issues += 1;
    }

    if (cfg.ai_security_enabled === 'false') {
      ctx.finding({
        severity: 'high',
        category: 'database',
        title: 'Security monitoring disabled',
        description: 'ai_security_enabled=false — the security worker only sends heartbeats, no integrity or IDS checks.',
        remediation: 'Enable monitoring in Settings → Security or set ai_security_enabled=true.',
        checkId: `${checkId}-monitoring-off`,
      });
      issues += 1;
    }

    if (cfg.emergency_override_active === 'true') {
      const expires = cfg.emergency_override_expires ?? 'unknown';
      ctx.finding({
        severity: 'medium',
        category: 'database',
        title: 'Emergency bypass currently active',
        description: `emergency_override_active=true (expires: ${expires}). Integrity and activity checks are paused.`,
        remediation: 'End bypass via Settings → Security → End bypass when maintenance is complete.',
        evidence: { expires },
        checkId: `${checkId}-bypass-active`,
      });
      issues += 1;
    }

    const threat = String(cfg.security_threat_level ?? 'low').toLowerCase();
    if (threat === 'high' || threat === 'critical') {
      ctx.finding({
        severity: threat === 'critical' ? 'critical' : 'high',
        category: 'database',
        title: `Elevated threat level: ${threat}`,
        description: `security_threat_level is "${threat}" — review recent security_events and resolve underlying issues.`,
        remediation: 'Open Settings → Security, review events, and remediate file integrity or intrusion alerts.',
        checkId: `${checkId}-threat-level`,
      });
      issues += 1;
    }

    if (cfg.intrusion_detection_enabled === 'false') {
      ctx.finding({
        severity: 'medium',
        category: 'database',
        title: 'Intrusion detection disabled',
        description: 'intrusion_detection_enabled=false reduces IDS pattern scanning on security events.',
        remediation: 'Enable intrusion detection in Settings → Security unless intentionally off.',
        checkId: `${checkId}-ids-off`,
      });
      issues += 1;
    }

    if (cfg.bot_detection_enabled === 'false') {
      ctx.finding({
        severity: 'medium',
        category: 'database',
        title: 'Bot detection disabled',
        description: 'bot_detection_enabled=false allows automated login probes without bot scoring.',
        remediation: 'Enable bot detection in Settings → Security.',
        checkId: `${checkId}-bot-off`,
      });
      issues += 1;
    }

    const recaptchaSecret = String(cfg.recaptcha_secret_key ?? '').trim();
    if (cfg.recaptcha_enabled === 'true' && (!recaptchaSecret || recaptchaSecret.length < 20)) {
      ctx.finding({
        severity: 'high',
        category: 'database',
        title: 'reCAPTCHA enabled but secret key invalid',
        description: 'recaptcha_enabled=true but recaptcha_secret_key is missing or too short.',
        remediation: 'Configure reCAPTCHA keys in Settings → Integrations or disable until keys are set.',
        checkId: `${checkId}-recaptcha`,
      });
      issues += 1;
    }

    if (cfg.mini_docked === 'true') {
      const miniToken = String(cfg.mini_api_token ?? '').trim();
      if (!miniToken || miniToken.length < 32) {
        ctx.finding({
          severity: 'critical',
          category: 'database',
          title: 'Mini docked without API token',
          description: 'mini_docked=true but mini_api_token is missing from system_configs.',
          remediation: 'Open Settings → Integrations → Mini and save a 32+ character API token.',
          checkId: `${checkId}-mini-token`,
        });
        issues += 1;
      }
    }

    const wipayKey = String(cfg.wipay_api_key ?? '').trim();
    if (wipayKey && looksPlaceholder(wipayKey)) {
      ctx.finding({
        severity: 'medium',
        category: 'database',
        title: 'WiPay API key placeholder in database',
        description: 'wipay_api_key in system_configs looks like a placeholder while payments may be enabled.',
        remediation: 'Set a real WiPay API key in Settings or disable WiPay.',
        checkId: `${checkId}-wipay-db`,
      });
      issues += 1;
    }

    const heartbeat = cfg.security_worker_last_heartbeat;
    if (heartbeat && heartbeat !== 'null') {
      const ageMs = Date.now() - new Date(heartbeat).getTime();
      const staleMs = 3 * 60 * 1000;
      if (ageMs > staleMs) {
        ctx.finding({
          severity: 'high',
          category: 'database',
          title: 'Security worker heartbeat stale',
          description: `Last heartbeat was ${Math.round(ageMs / 1000)}s ago (>${staleMs / 1000}s threshold).`,
          remediation: 'Ensure npm run security:worker (or start:production) is running as a service.',
          evidence: { lastHeartbeat: heartbeat, ageSeconds: Math.round(ageMs / 1000) },
          checkId: `${checkId}-worker-stale`,
        });
        issues += 1;
      }
    } else if (cfg.ai_security_enabled !== 'false') {
      ctx.finding({
        severity: 'high',
        category: 'database',
        title: 'Security worker never reported heartbeat',
        description: 'No security_worker_last_heartbeat in system_configs while monitoring is expected.',
        remediation: 'Start the security worker: npm run security:worker',
        checkId: `${checkId}-worker-missing`,
      });
      issues += 1;
    }

    const recentEvents = await dbAll(
      db,
      `SELECT event_type, COUNT(*) AS c FROM security_events
       WHERE is_active = 1 AND created_at >= datetime('now', '-24 hours')
       GROUP BY event_type
       ORDER BY c DESC
       LIMIT 15`
    );
    const criticalTypes = ['file_integrity', 'sql_injection', 'intrusion_detected', 'license_integrity'];
    for (const row of recentEvents) {
      if (criticalTypes.includes(row.event_type) && row.c >= 1) {
        ctx.finding({
          severity: row.event_type === 'file_integrity' ? 'high' : 'medium',
          category: 'database',
          title: `Recent security events: ${row.event_type}`,
          description: `${row.c} active "${row.event_type}" event(s) in the last 24 hours.`,
          remediation: 'Review Settings → Security events and remediate root cause.',
          evidence: { eventType: row.event_type, count24h: row.c },
          checkId: `${checkId}-events-${row.event_type}`,
        });
        issues += 1;
      }
    }

    const adminUsers = await dbAll(
      db,
      `SELECT id, username, security_clearance, is_active FROM users
       WHERE role = 'admin' AND is_active = 1`
    );
    if (adminUsers.length === 0) {
      ctx.finding({
        severity: 'medium',
        category: 'database',
        title: 'No active admin users',
        description: 'No active users with role=admin found — may indicate misconfiguration.',
        remediation: 'Verify at least one S-CLS1 admin account exists for emergency access.',
        checkId: `${checkId}-no-admin`,
      });
      issues += 1;
    }

    const weakClearanceAdmins = adminUsers.filter((u) => u.security_clearance !== 'S-CLS1');
    if (weakClearanceAdmins.length > 0) {
      ctx.finding({
        severity: 'low',
        category: 'database',
        title: 'Admin users without S-CLS1 clearance',
        description: `${weakClearanceAdmins.length} active admin(s) lack S-CLS1 — cannot authorize emergency bypass or disable monitoring.`,
        remediation: 'Assign S-CLS1 to primary production admins or document intentional restriction.',
        evidence: weakClearanceAdmins.map((u) => u.username),
        checkId: `${checkId}-admin-clearance`,
      });
      issues += 1;
    }

    await closeDb(db);
  } catch (err) {
    ctx.recordCheck(
      checkId,
      'Database security posture',
      'failed',
      err instanceof Error ? err.message : String(err)
    );
    ctx.finding({
      severity: 'medium',
      category: 'database',
      title: 'Database audit failed',
      description: err instanceof Error ? err.message : String(err),
      remediation: 'Verify DATABASE_PATH and sqlite3 availability.',
      checkId: `${checkId}-error`,
    });
    return;
  }

  const licDb = licenseDbPath(root, env);
  if (fs.existsSync(licDb)) {
    try {
      const licSqlite = await openSqlite(licDb);
      const auditTable = await dbAll(
        licSqlite,
        `SELECT name FROM sqlite_master WHERE type='table' AND name='license_insert_audit'`
      );
      if (auditTable.length === 0) {
        ctx.finding({
          severity: 'low',
          category: 'database',
          title: 'License insert audit table missing',
          description: 'license_system.db has no license_insert_audit table for LIC-MSP serial tracking.',
          remediation: 'Run license_activation_system_new/enable_lic_msp_audit.py to enable license audit triggers.',
          checkId: `${checkId}-license-audit-table`,
        });
        issues += 1;
      }
      await closeDb(licSqlite);
    } catch {
      /* optional */
    }
  }

  ctx.recordCheck(
    checkId,
    'Database security posture',
    issues === 0 ? 'passed' : 'failed',
    issues === 0 ? 'DB security config OK' : `${issues} issue(s)`
  );
}
