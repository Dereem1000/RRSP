#!/usr/bin/env node
import { loadEnvFile, readText } from '../lib/utils.mjs';

export async function runConfigChecks(ctx) {
  const checkId = 'production-config';
  const { root } = ctx;
  let issues = 0;

  const { env } = loadEnvFile(root);

  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim() ?? '';
  if (!siteUrl || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(siteUrl)) {
    ctx.finding({
      severity: 'high',
      category: 'configuration',
      title: 'NEXT_PUBLIC_SITE_URL not production-ready',
      description: `NEXT_PUBLIC_SITE_URL is "${siteUrl || '(empty)'}" — must be your live HTTPS domain.`,
      remediation: 'Set NEXT_PUBLIC_SITE_URL=https://www.computerdynamicstt.com (or your production domain).',
      checkId: `${checkId}-site-url`,
    });
    issues += 1;
  } else if (!/^https:\/\//i.test(siteUrl)) {
    ctx.finding({
      severity: 'medium',
      category: 'configuration',
      title: 'NEXT_PUBLIC_SITE_URL not HTTPS',
      description: `NEXT_PUBLIC_SITE_URL uses non-HTTPS scheme: ${siteUrl}`,
      remediation: 'Use https:// for production site URL in emails and client links.',
      checkId: `${checkId}-site-url-https`,
    });
    issues += 1;
  }

  if (env.DEMO_MODE === 'true') {
    ctx.finding({
      severity: 'critical',
      category: 'configuration',
      title: 'DEMO_MODE enabled',
      description: 'DEMO_MODE=true exposes showcase/demo behavior on this instance.',
      remediation: 'Unset DEMO_MODE or set DEMO_MODE=false for production deployments.',
      checkId: `${checkId}-demo-mode`,
    });
    issues += 1;
  }

  if (env.NODE_ENV && env.NODE_ENV !== 'production') {
    ctx.finding({
      severity: 'medium',
      category: 'configuration',
      title: 'NODE_ENV is not production',
      description: `NODE_ENV=${env.NODE_ENV}`,
      remediation: 'Set NODE_ENV=production when running npm run start:production.',
      checkId: `${checkId}-node-env`,
    });
    issues += 1;
  }

  const gitignore = readText(root, '.gitignore') ?? '';
  const requiredIgnore = [
    '.env',
    'scripts/tmp-login.json',
    'cloudflared-computerdynamics.yml',
    'data/mini-dock.json',
    'data/security-audit-reports',
  ];
  for (const entry of requiredIgnore) {
    const normalized = entry.replace(/\/$/, '');
    const found = gitignore.split(/\r?\n/).some((line) => {
      const t = line.trim().replace(/\/$/, '');
      return t === normalized;
    });
    if (!found) {
      ctx.finding({
        severity: 'low',
        category: 'configuration',
        title: `.gitignore missing entry: ${entry}`,
        description: `Sensitive or local-only path "${entry}" is not listed in .gitignore.`,
        remediation: `Add "${entry}" to .gitignore.`,
        checkId: `${checkId}-gitignore`,
      });
      issues += 1;
    }
  }

  if (env.LICENSE_MONITORING_ENABLED === 'false') {
    ctx.finding({
      severity: 'medium',
      category: 'configuration',
      title: 'License monitoring disabled',
      description: 'LICENSE_MONITORING_ENABLED=false disables license integrity and API health checks.',
      remediation: 'Remove LICENSE_MONITORING_ENABLED=false unless intentionally disabled during maintenance.',
      checkId: `${checkId}-license-monitoring`,
    });
    issues += 1;
  }

  ctx.recordCheck(
    checkId,
    'Production configuration hardening',
    issues === 0 ? 'passed' : 'failed',
    issues === 0 ? 'Config looks production-ready' : `${issues} issue(s)`
  );
}
