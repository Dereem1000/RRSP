#!/usr/bin/env node
/**
 * Full security review — 2 steps:
 *   Step 1: Config/hygiene audit (offline, no live HTTP)
 *   Step 2: Production web penetration test
 *
 * Usage:
 *   npm run audit:security:full
 *   npm run audit:security:full -- --base-url=https://www.computerdynamicstt.com
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function parseArgs(argv) {
  const passthrough = [];
  let continueOnStep1Fail = false;

  for (const arg of argv) {
    if (arg === '--continue-on-step1-fail') continueOnStep1Fail = true;
    else passthrough.push(arg);
  }

  return { passthrough, continueOnStep1Fail };
}

function runNode(script, extraArgs = []) {
  const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'security-audit', script), ...extraArgs], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  return result.status ?? 1;
}

function main() {
  const { passthrough, continueOnStep1Fail } = parseArgs(process.argv.slice(2));

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Computer Dynamics v2 — Full Security Review (2 steps)   ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  console.log('━━━ Step 1/2: Configuration & hygiene audit ━━━\n');
  const step1Args = ['--skip-live', ...passthrough.filter((a) => !a.startsWith('--base-url='))];
  const step1Code = runNode('run.mjs', step1Args);

  if (step1Code !== 0 && !continueOnStep1Fail) {
    console.log('\nStep 1 failed — fix config issues before relying on penetration test results.');
    console.log('Use --continue-on-step1-fail to run Step 2 anyway.\n');
    process.exit(step1Code);
  }

  if (step1Code !== 0) {
    console.log('\nStep 1 had findings — continuing to Step 2 per --continue-on-step1-fail\n');
  }

  console.log('\n━━━ Step 2/2: Production web penetration test ━━━\n');
  const step2Args = passthrough;
  const step2Code = runNode('run-pentest.mjs', step2Args);

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Full security review complete                           ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Step 1 (config audit):  ${step1Code === 0 ? 'PASSED' : 'FAILED'}`);
  console.log(`  Step 2 (pentest):        ${step2Code === 0 ? 'PASSED' : 'FAILED'}`);
  console.log('');
  console.log('  Reports:');
  console.log('    data/security-audit-reports/latest.md');
  console.log('    data/security-audit-reports/latest-pentest.md');
  console.log('');

  process.exit(step1Code !== 0 || step2Code !== 0 ? 1 : 0);
}

main();
