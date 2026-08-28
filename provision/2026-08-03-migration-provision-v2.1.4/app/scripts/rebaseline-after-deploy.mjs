#!/usr/bin/env node
/**
 * Rebaseline protected files and reconcile security events after an intentional deploy.
 * Run after dependency or security-platform updates that trigger file_integrity alerts.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
process.env.CD_V2_ROOT = root;

await import('@cd-v2/database');
const { rebaselineProtectedFiles } = await import('../packages/security/dist/monitoring.js');
const { reconcileSecurityEvents } = await import('../packages/security/dist/event-reconcile.js');

console.log('Rebaselining protected files...');
const report = await rebaselineProtectedFiles();
console.log(`Baselines refreshed: ${report.ok}/${report.protected} files OK`);

console.log('Reconciling security events...');
const reconciled = await reconcileSecurityEvents();
console.log(JSON.stringify(reconciled, null, 2));

console.log('Running one security worker cycle...');
const worker = spawnSync('npm', ['run', 'security:worker:once'], {
  cwd: root,
  shell: true,
  stdio: 'inherit',
});
process.exit(worker.status === 0 ? 0 : worker.status ?? 1);
