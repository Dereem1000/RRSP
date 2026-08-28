#!/usr/bin/env node
/**
 * External security integration tests — thin wrapper around the Step 2 pentest runner.
 * Kept for backward compatibility with npm run test:security:external.
 *
 * Usage: npm run test:security:external
 *        BASE_URL=http://127.0.0.1:3000 npm run test:security:external
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuditContext } from './security-audit/lib/context.mjs';
import { resolvePentestBaseUrl, runProductionPentest } from './security-audit/lib/pentest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function main() {
  const baseUrl = resolvePentestBaseUrl(root);
  const ctx = new AuditContext(root, { environment: 'local', baseUrl });

  console.log(`Security external tests → ${baseUrl}`);
  console.log('(uses production pentest runner — see npm run audit:security:pentest)\n');

  await runProductionPentest(ctx, {
    baseUrl,
    runWorker: process.env.SECURITY_TEST_RUN_WORKER === '1',
    skipRateLimit: process.env.SECURITY_TEST_SKIP_RATE_LIMIT === '1',
    verifyLocalDb: process.env.SECURITY_TEST_SKIP_DB_VERIFY !== '1',
  });

  const failed = ctx.checks.filter((c) => c.status === 'failed');
  const findings = ctx.findings;

  console.log('\n---');
  console.log(`${ctx.checks.length - failed.length}/${ctx.checks.length} probes passed`);
  if (failed.length > 0 || findings.length > 0) {
    if (findings.length) {
      console.log('Defense gaps:');
      for (const f of findings) console.log(`  - ${f.title}`);
    }
    process.exitCode = 1;
  } else {
    console.log('All checks passed.');
  }
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exitCode = 1;
});
