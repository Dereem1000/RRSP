#!/usr/bin/env node
/**
 * Computer Dynamics v2 — production security audit suite.
 *
 * Runs static and optional live checks, writes timestamped reports to
 * data/security-audit-reports/ (JSON + Markdown + latest.* copies).
 *
 * Usage:
 *   npm run audit:security              Step 1 only (config/hygiene, offline)
 *   npm run audit:security:full         Step 1 + Step 2 (recommended)
 *   npm run audit:security:pentest      Step 2 only (production web attacks)
 *
 * Environment:
 *   AUDIT_BASE_URL   — live probe target (same as --base-url)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuditContext } from './lib/context.mjs';
import { writeAuditReport, printConsoleSummary } from './lib/report.mjs';
import { runSecretsChecks } from './checks/secrets.mjs';
import { runConfigChecks } from './checks/config.mjs';
import { runDatabaseChecks } from './checks/database.mjs';
import { runDependencyChecks } from './checks/dependencies.mjs';
import { runFilesystemChecks } from './checks/filesystem.mjs';
import { runInfrastructureChecks } from './checks/infrastructure.mjs';
import { runLiveChecks } from './checks/live.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.AUDIT_BASE_URL?.trim() ?? '',
    skipLive: false,
    skipDeps: false,
    strict: false,
    environment: 'production',
  };

  for (const arg of argv) {
    if (arg === '--skip-live') opts.skipLive = true;
    else if (arg === '--skip-deps') opts.skipDeps = true;
    else if (arg === '--strict') opts.strict = true;
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice('--base-url='.length).trim();
    else if (arg.startsWith('--env=')) opts.environment = arg.slice('--env='.length).trim();
    else if (arg === '--help' || arg === '-h') {
      console.log(`Computer Dynamics v2 security audit (Step 1)

npm run audit:security [-- options]
npm run audit:security:full     # Step 1 + production pentest

Options:
  --skip-live      Skip HTTP probes (default for Step 1 in full review)
  --skip-deps      Skip npm audit (faster)
  --strict         Exit 1 on any finding (including low/info)
  --env=NAME       Label report environment (default: production)

Reports: data/security-audit-reports/latest.md
`);
      process.exit(0);
    }
  }

  return opts;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const ctx = new AuditContext(root, options);

  console.log('Computer Dynamics v2 — Security Audit Suite\n');
  console.log(`Root:        ${root}`);
  console.log(`Environment: ${options.environment}`);
  if (options.baseUrl && !options.skipLive) {
    console.log(`Live probes: ${options.baseUrl}`);
  } else {
    console.log('Live probes: skipped');
  }
  console.log('');

  const suites = [
    ['Secrets', runSecretsChecks],
    ['Config', runConfigChecks],
    ['Database', runDatabaseChecks],
    ['Dependencies', runDependencyChecks],
    ['Filesystem', runFilesystemChecks],
    ['Infrastructure', runInfrastructureChecks],
    ['Live', runLiveChecks],
  ];

  for (const [name, fn] of suites) {
    console.log(`▶ ${name}`);
    try {
      await fn(ctx);
    } catch (err) {
      console.error(`  ✗ ${name} suite error:`, err instanceof Error ? err.message : err);
      ctx.finding({
        severity: 'medium',
        category: 'audit',
        title: `${name} check suite failed`,
        description: err instanceof Error ? err.message : String(err),
        remediation: 'Fix the underlying error and re-run npm run audit:security.',
        checkId: `suite-error-${name.toLowerCase()}`,
      });
      ctx.recordCheck(name.toLowerCase(), `${name} checks`, 'failed', 'suite threw');
    }
  }

  const paths = writeAuditReport(root, ctx);
  printConsoleSummary(paths.payload, paths);

  const code = ctx.exitCode();
  if (code !== 0) {
    console.log('\nAudit finished with actionable findings — see report for remediation steps.');
  }
  process.exit(code);
}

main().catch((err) => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
