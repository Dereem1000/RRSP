#!/usr/bin/env node
import { runNpmAudit } from '../lib/utils.mjs';

const SEVERITY_MAP = {
  critical: 'critical',
  high: 'high',
  moderate: 'medium',
  low: 'low',
  info: 'info',
};

export async function runDependencyChecks(ctx) {
  const checkId = 'dependencies';
  if (ctx.options.skipDeps) {
    ctx.recordCheck(checkId, 'npm dependency vulnerabilities', 'skipped', '--skip-deps');
    return;
  }

  const { root } = ctx;
  const result = runNpmAudit(root);

  if (!result.ok || !result.data) {
    ctx.recordCheck(
      checkId,
      'npm dependency vulnerabilities',
      'skipped',
      result.error ?? 'npm audit unavailable'
    );
    ctx.finding({
      severity: 'info',
      category: 'dependencies',
      title: 'Dependency audit could not run',
      description: result.error ?? 'npm audit did not complete.',
      remediation: 'Run npm audit manually from the project root.',
      checkId: `${checkId}-unavailable`,
    });
    return;
  }

  const advisories = result.data.vulnerabilities ?? {};
  const entries = Object.values(advisories);
  let issues = 0;

  for (const adv of entries) {
    const sev = SEVERITY_MAP[adv.severity] ?? 'medium';
    if (sev === 'info' || sev === 'low') continue;

    const name = adv.name ?? adv.via?.[0]?.name ?? 'unknown';
    const title = adv.title ?? adv.via?.[0]?.title ?? 'npm advisory';
    const range = adv.range ?? adv.via?.[0]?.range ?? '';

    ctx.finding({
      severity: sev,
      category: 'dependencies',
      title: `Vulnerable dependency: ${name}`,
      description: `${title}${range ? ` (affected: ${range})` : ''}`,
      remediation: adv.fixAvailable
        ? 'Run npm audit fix or update the package manually. Test after upgrading.'
        : 'Review advisory; may require manual upgrade or accepted risk documentation.',
      evidence: {
        name,
        severity: adv.severity,
        url: adv.url ?? adv.via?.[0]?.url ?? null,
        fixAvailable: Boolean(adv.fixAvailable),
      },
      checkId: `${checkId}-${name}`,
    });
    issues += 1;
  }

  const metadata = result.data.metadata?.vulnerabilities ?? {};
  const detail =
    issues === 0
      ? `npm audit clean (${metadata.total ?? 0} total advisories)`
      : `${issues} high/critical/moderate finding(s) from npm audit`;

  ctx.recordCheck(
    checkId,
    'npm dependency vulnerabilities',
    issues === 0 ? 'passed' : 'failed',
    detail
  );
}
