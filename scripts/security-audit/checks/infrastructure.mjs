#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { loadEnvFile, readText, fileExists } from '../lib/utils.mjs';

export async function runInfrastructureChecks(ctx) {
  const checkId = 'infrastructure';
  const { root } = ctx;
  let issues = 0;

  const { env } = loadEnvFile(root);

  const tunnelPath = path.join(root, 'cloudflared-computerdynamics.yml');
  if (fs.existsSync(tunnelPath)) {
    const tunnel = fs.readFileSync(tunnelPath, 'utf8');
    const requiredHosts = [
      { host: 'www.computerdynamicstt.com', port: ':3000' },
      { host: 'api.computerdynamicstt.com', port: ':5001' },
    ];

    for (const { host, port } of requiredHosts) {
      if (!tunnel.includes(host)) {
        ctx.finding({
          severity: 'medium',
          category: 'infrastructure',
          title: `Tunnel missing hostname: ${host}`,
          description: `cloudflared-computerdynamics.yml does not route ${host}.`,
          remediation: `Add a Public Hostname ingress for ${host} → local service${port}.`,
          checkId: `${checkId}-tunnel-${host}`,
        });
        issues += 1;
      }
    }

    if (/localhost:3000/i.test(tunnel) && /0\.0\.0\.0:3000/.test(tunnel) === false) {
      /* ok — localhost is normal for tunnel target */
    }
  } else {
    ctx.finding({
      severity: 'info',
      category: 'infrastructure',
      title: 'Cloudflare tunnel config not found',
      description: 'No cloudflared-computerdynamics.yml — skipping tunnel ingress checks.',
      remediation: 'Add tunnel config when exposing production via Cloudflare.',
      checkId: `${checkId}-no-tunnel`,
    });
  }

  const licenseApiEnv = path.join(root, 'license_activation_system_new', '.env');
  if (fs.existsSync(licenseApiEnv)) {
    const licEnv = fs.readFileSync(licenseApiEnv, 'utf8');
    if (/FLASK_DEBUG\s*=\s*true/i.test(licEnv) || /DEBUG\s*=\s*true/i.test(licEnv)) {
      ctx.finding({
        severity: 'high',
        category: 'infrastructure',
        title: 'License API debug mode enabled',
        description: 'license_activation_system_new/.env has DEBUG/FLASK_DEBUG=true.',
        remediation: 'Disable debug mode for production license API (port 5001).',
        checkId: `${checkId}-license-debug`,
      });
      issues += 1;
    }
  }

  const pkg = JSON.parse(readText(root, 'package.json') ?? '{}');
  if (!pkg.scripts?.['security:worker'] || !pkg.scripts?.['start:production']) {
    ctx.finding({
      severity: 'low',
      category: 'infrastructure',
      title: 'Production security scripts missing',
      description: 'package.json should define security:worker and start:production scripts.',
      remediation: 'Verify monorepo scripts for worker + production start are intact.',
      checkId: `${checkId}-scripts`,
    });
    issues += 1;
  }

  const backupDir = path.join(root, 'data', 'backups');
  if (!fs.existsSync(backupDir)) {
    ctx.finding({
      severity: 'info',
      category: 'infrastructure',
      title: 'No backup directory yet',
      description: 'data/backups/ does not exist — auto-backup may not have run.',
      remediation: 'Configure auto-backup in Settings → Backup for disaster recovery.',
      checkId: `${checkId}-no-backups`,
    });
  } else {
    const backups = fs.readdirSync(backupDir).filter((f) => !f.startsWith('.'));
    if (backups.length === 0) {
      ctx.finding({
        severity: 'medium',
        category: 'infrastructure',
        title: 'Backup directory empty',
        description: 'data/backups/ exists but contains no backup archives.',
        remediation: 'Run a manual backup from Settings → Backup and enable scheduled auto-backup.',
        checkId: `${checkId}-empty-backups`,
      });
      issues += 1;
    }
  }

  if (env.TURNSTILE_SECRET_KEY?.trim() && !env.TURNSTILE_SITE_KEY?.trim()) {
    ctx.finding({
      severity: 'medium',
      category: 'infrastructure',
      title: 'Turnstile secret without site key',
      description: 'TURNSTILE_SECRET_KEY is set but TURNSTILE_SITE_KEY is missing.',
      remediation: 'Set both Turnstile keys or remove partial configuration.',
      checkId: `${checkId}-turnstile`,
    });
    issues += 1;
  }

  if (!fileExists(root, 'stop.bat') || !fileExists(root, 'start-production.bat')) {
    ctx.finding({
      severity: 'info',
      category: 'infrastructure',
      title: 'Production lifecycle scripts',
      description: 'start-production.bat or stop.bat missing — ops scripts may be incomplete.',
      remediation: 'Ensure production start/stop scripts exist for your deployment workflow.',
      checkId: `${checkId}-lifecycle-bat`,
    });
  }

  ctx.recordCheck(
    checkId,
    'Infrastructure & deployment',
    issues === 0 ? 'passed' : 'failed',
    issues === 0 ? 'Infrastructure checks OK' : `${issues} issue(s)`
  );
}
