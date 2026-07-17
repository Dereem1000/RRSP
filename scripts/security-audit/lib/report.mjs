#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { hostname, timestampSlug } from './utils.mjs';

const SEVERITY_EMOJI = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
  info: '⚪',
};

export function reportsDir(root) {
  return path.join(root, 'data', 'security-audit-reports');
}

export function writeAuditReport(root, ctx) {
  const dir = reportsDir(root);
  fs.mkdirSync(dir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const slug = timestampSlug(new Date(generatedAt));
  const reportId = `audit-${slug}`;
  const summary = ctx.summary();
  const findings = ctx.sortedFindings();

  const payload = {
    reportId,
    generatedAt,
    hostname: hostname(),
    environment: ctx.options.environment,
    baseUrl: ctx.options.baseUrl || null,
    system: {
      name: 'Computer Dynamics System v2',
      version: '2.1.0',
      root: ctx.root,
    },
    summary,
    overallStatus: ctx.overallStatus(),
    findings,
    checks: ctx.checks,
    meta: {
      strictMode: ctx.options.strict,
      skipLive: ctx.options.skipLive,
      skipDeps: ctx.options.skipDeps,
      startedAt: ctx.startedAt,
      completedAt: generatedAt,
    },
  };

  const jsonPath = path.join(dir, `${reportId}.json`);
  const mdPath = path.join(dir, `${reportId}.md`);
  const latestJsonPath = path.join(dir, 'latest.json');
  const latestMdPath = path.join(dir, 'latest.md');

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderMarkdown(payload), 'utf8');
  fs.writeFileSync(latestJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(latestMdPath, renderMarkdown(payload), 'utf8');

  return { jsonPath, mdPath, latestJsonPath, latestMdPath, payload };
}

export function writePentestReport(root, ctx) {
  const dir = reportsDir(root);
  fs.mkdirSync(dir, { recursive: true });

  const generatedAt = new Date().toISOString();
  const slug = timestampSlug(new Date(generatedAt));
  const reportId = `pentest-${slug}`;
  const summary = ctx.summary();
  const findings = ctx.sortedFindings();

  const payload = {
    reportId,
    reportType: 'penetration-test',
    generatedAt,
    hostname: hostname(),
    environment: ctx.options.environment,
    baseUrl: ctx.options.baseUrl || null,
    system: {
      name: 'Computer Dynamics System v2',
      version: '2.1.0',
      root: ctx.root,
    },
    summary,
    overallStatus: ctx.overallStatus(),
    findings,
    probes: ctx.checks,
    meta: {
      strictMode: ctx.options.strict,
      attackerModel: 'anonymous HTTP, RFC5737 test IPs, fake credentials',
      startedAt: ctx.startedAt,
      completedAt: generatedAt,
    },
  };

  const jsonPath = path.join(dir, `${reportId}.json`);
  const mdPath = path.join(dir, `${reportId}.md`);
  const latestJsonPath = path.join(dir, 'latest-pentest.json');
  const latestMdPath = path.join(dir, 'latest-pentest.md');

  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(mdPath, renderPentestMarkdown(payload), 'utf8');
  fs.writeFileSync(latestJsonPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(latestMdPath, renderPentestMarkdown(payload), 'utf8');

  return { jsonPath, mdPath, latestJsonPath, latestMdPath, payload };
}

function renderPentestMarkdown(report) {
  const lines = [];
  lines.push('# Production Penetration Test Report');
  lines.push('');
  lines.push('| Field | Value |');
  lines.push('|-------|-------|');
  lines.push(`| Report ID | \`${report.reportId}\` |`);
  lines.push(`| Type | Web attack simulation (Step 2) |`);
  lines.push(`| Target | ${report.baseUrl ?? '(not set)'} |`);
  lines.push(`| Generated | ${report.generatedAt} |`);
  lines.push(`| Host | ${report.hostname} |`);
  lines.push(`| Overall status | **${report.overallStatus}** |`);
  lines.push(`| Defense score | ${report.summary.score}/100 |`);
  lines.push('');
  lines.push('## Attack model');
  lines.push('');
  lines.push('- Anonymous internet attacker (no valid credentials)');
  lines.push('- Synthetic IPs only (RFC5737 TEST-NET-3)');
  lines.push('- Probes: bot detection, brute-force, honeypot, rate limits, SQLi, XSS, unauthorized APIs');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    lines.push(`| ${sev} | ${report.summary[sev]} |`);
  }
  lines.push(`| **Defense gaps** | **${report.summary.total}** |`);
  lines.push('');
  lines.push(
    `Probes: ${report.summary.checksPassed} passed, ${report.summary.checksFailed} failed, ${report.summary.checksSkipped} skipped (${report.summary.checksRun} total).`
  );
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('## Findings');
    lines.push('');
    lines.push('All web attack probes were blocked or rejected — defenses held.');
    lines.push('');
  } else {
    lines.push('## Defense gaps (fix later)');
    lines.push('');
    for (const f of report.findings) {
      const icon = SEVERITY_EMOJI[f.severity] ?? '•';
      lines.push(`### ${icon} ${f.id}: ${f.title}`);
      lines.push('');
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push(`- **Category:** ${f.category}`);
      lines.push(`- **Probe:** \`${f.checkId}\``);
      lines.push(`- **Status:** ${f.status}`);
      lines.push('');
      lines.push(f.description);
      lines.push('');
      lines.push(`**Remediation:** ${f.remediation}`);
      if (f.evidence) {
        lines.push('');
        lines.push('**Evidence:**');
        lines.push('```');
        lines.push(typeof f.evidence === 'string' ? f.evidence : JSON.stringify(f.evidence, null, 2));
        lines.push('```');
      }
      lines.push('');
    }
  }

  lines.push('## Probes executed');
  lines.push('');
  lines.push('| Probe | Status | Detail |');
  lines.push('|-------|--------|--------|');
  for (const c of report.probes) {
    const detail = (c.detail || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${c.name} | ${c.status} | ${detail} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Re-run Step 2: `npm run audit:security:pentest`');
  lines.push('Full 2-step review: `npm run audit:security:full`');
  lines.push('');
  lines.push(`Machine-readable copy: \`data/security-audit-reports/${report.reportId}.json\``);
  lines.push('');

  return lines.join('\n');
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# Security Audit Report');
  lines.push('');
  lines.push(`| Field | Value |`);
  lines.push(`|-------|-------|`);
  lines.push(`| Report ID | \`${report.reportId}\` |`);
  lines.push(`| Generated | ${report.generatedAt} |`);
  lines.push(`| Host | ${report.hostname} |`);
  lines.push(`| Environment | ${report.environment} |`);
  lines.push(`| Overall status | **${report.overallStatus}** |`);
  lines.push(`| Security score | ${report.summary.score}/100 |`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Severity | Count |');
  lines.push('|----------|-------|');
  for (const sev of ['critical', 'high', 'medium', 'low', 'info']) {
    lines.push(`| ${sev} | ${report.summary[sev]} |`);
  }
  lines.push(`| **Total findings** | **${report.summary.total}** |`);
  lines.push('');
  lines.push(
    `Checks: ${report.summary.checksPassed} passed, ${report.summary.checksFailed} failed, ${report.summary.checksSkipped} skipped (${report.summary.checksRun} total).`
  );
  lines.push('');

  if (report.findings.length === 0) {
    lines.push('## Findings');
    lines.push('');
    lines.push('No security issues detected in this audit run.');
    lines.push('');
  } else {
    lines.push('## Findings (fix later)');
    lines.push('');
    lines.push(
      'Each finding is stored with `status: open`. Work through these in priority order (critical → high → medium → low).'
    );
    lines.push('');

    for (const f of report.findings) {
      const icon = SEVERITY_EMOJI[f.severity] ?? '•';
      lines.push(`### ${icon} ${f.id}: ${f.title}`);
      lines.push('');
      lines.push(`- **Severity:** ${f.severity}`);
      lines.push(`- **Category:** ${f.category}`);
      lines.push(`- **Check:** \`${f.checkId}\``);
      lines.push(`- **Status:** ${f.status}`);
      lines.push('');
      lines.push(f.description);
      lines.push('');
      lines.push(`**Remediation:** ${f.remediation}`);
      if (f.evidence) {
        lines.push('');
        lines.push('**Evidence:**');
        lines.push('```');
        lines.push(typeof f.evidence === 'string' ? f.evidence : JSON.stringify(f.evidence, null, 2));
        lines.push('```');
      }
      lines.push('');
    }
  }

  lines.push('## Checks executed');
  lines.push('');
  lines.push('| Check | Status | Detail |');
  lines.push('|-------|--------|--------|');
  for (const c of report.checks) {
    const detail = (c.detail || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(`| ${c.name} | ${c.status} | ${detail} |`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Re-run: `npm run audit:security`');
  lines.push('');
  lines.push(`Machine-readable copy: \`data/security-audit-reports/${report.reportId}.json\``);
  lines.push('');

  return lines.join('\n');
}

export function printConsoleSummary(report, paths) {
  console.log('\n--- Audit complete ---\n');
  console.log(`Report ID:    ${report.reportId}`);
  console.log(`Overall:      ${report.overallStatus} (score ${report.summary.score}/100)`);
  console.log(`Findings:     ${report.summary.total} (critical=${report.summary.critical}, high=${report.summary.high}, medium=${report.summary.medium}, low=${report.summary.low})`);
  console.log(`JSON report:  ${paths.jsonPath}`);
  console.log(`Markdown:     ${paths.mdPath}`);
  console.log(`Latest copy:  ${paths.latestMdPath}`);

  if (report.findings.length) {
    console.log('\nOpen findings:');
    for (const f of report.findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.id} — ${f.title}`);
    }
  } else {
    console.log('\nNo open findings — production security posture looks good for checked items.');
  }
}

export function printPentestSummary(report, paths) {
  console.log('\n--- Penetration test complete ---\n');
  console.log(`Report ID:    ${report.reportId}`);
  console.log(`Target:       ${report.baseUrl}`);
  console.log(`Overall:      ${report.overallStatus} (defense score ${report.summary.score}/100)`);
  console.log(`Defense gaps: ${report.summary.total} (critical=${report.summary.critical}, high=${report.summary.high}, medium=${report.summary.medium})`);
  console.log(`JSON report:  ${paths.jsonPath}`);
  console.log(`Markdown:     ${paths.mdPath}`);
  console.log(`Latest copy:  ${paths.latestMdPath}`);

  if (report.findings.length) {
    console.log('\nDefense gaps:');
    for (const f of report.findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.id} — ${f.title}`);
    }
  } else {
    console.log('\nAll probes blocked — web defenses held against simulated attacks.');
  }
}
