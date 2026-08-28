#!/usr/bin/env node
/**
 * Integration test: tamper a protected file and verify auto-repair restores it from backup.
 *
 * Prerequisites: built packages (@cd-v2/database, @cd-v2/backup, @cd-v2/security)
 * Usage: npm run test:auto-repair
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
process.env.CD_V2_ROOT = process.env.CD_V2_ROOT ?? root;

const TEST_FILE = 'packages/security/src/features.ts';

function pass(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.error(`  ✗ ${msg}`);
  process.exitCode = 1;
}

const { getMonorepoRoot, getProtectedFilePaths, getBackupAppPaths, SystemConfig, SecurityEvent } =
  await import('@cd-v2/database');
const { createBackupJob } = await import('@cd-v2/backup');
const { ensureFileBaselines, runFileIntegrityPass, SecurityHttpKeys, refreshEmergencyState, isEmergencyBypassActive } = await import('@cd-v2/security');

const backupSet = new Set(getBackupAppPaths());
const missingFromBackup = getProtectedFilePaths().filter((rel) => !backupSet.has(rel));
if (missingFromBackup.length > 0) {
  fail(`Protected paths missing from backup catalog: ${missingFromBackup.join(', ')}`);
  process.exit(1);
}
pass('All protected paths are included in full backup app/ catalog');

const fullPath = path.join(getMonorepoRoot(), TEST_FILE);
if (!fs.existsSync(fullPath)) {
  fail(`Test file missing: ${TEST_FILE}`);
  process.exit(1);
}

const original = fs.readFileSync(fullPath, 'utf8');

try {
  await SystemConfig.setConfig(SecurityHttpKeys.repairEnabled, true, 'boolean', 'security');
  await SystemConfig.setConfig(SecurityHttpKeys.repairUseBackups, true, 'boolean', 'security');
  pass('Auto-repair enabled for test');

  await refreshEmergencyState();
  if (await isEmergencyBypassActive()) {
    console.log('  · Emergency bypass active — clearing for test…');
    const { EmergencyOverride } = await import('@cd-v2/database');
    const { SecurityConfigKeys } = await import('@cd-v2/security');
    await EmergencyOverride.update(
      { status: 'revoked', endTime: new Date(), isActive: false },
      { where: { status: 'active', overrideType: 'security_bypass' } }
    );
    await SystemConfig.setConfig(SecurityConfigKeys.emergencyActive, false, 'boolean', 'security');
    await SystemConfig.setConfig(SecurityConfigKeys.emergencyExpires, '', 'string', 'security');
    await refreshEmergencyState();
  }
  if (await isEmergencyBypassActive()) {
    throw new Error('Emergency bypass still active — cannot test auto-repair');
  }
  pass('Emergency bypass inactive');

  console.log('  · Creating full backup…');
  const backup = await createBackupJob('full', 'Auto-repair integration test');
  pass(`Backup created: ${backup.backupName}`);

  console.log('  · Refreshing file baselines…');
  const baselines = await ensureFileBaselines();
  if (!baselines[TEST_FILE]) {
    throw new Error(`No baseline for ${TEST_FILE}`);
  }
  pass('Baseline ready for test file');

  const eventsBefore = Number((await SecurityEvent.max('id')) ?? 0);

  console.log('  · Simulating tamper…');
  fs.writeFileSync(fullPath, `${original}\n// auto-repair tamper test\n`, 'utf8');
  const tampered = fs.readFileSync(fullPath, 'utf8');
  if (tampered === original) {
    throw new Error('Tamper did not change file content');
  }
  pass('Tamper applied');

  console.log('  · Running file integrity pass…');
  const tamperCount = await runFileIntegrityPass(baselines);
  if (tamperCount < 1) {
    throw new Error(`Expected tamper detections, got ${tamperCount}`);
  }
  pass(`Detected ${tamperCount} tampered file(s)`);

  const restored = fs.readFileSync(fullPath, 'utf8');
  if (restored !== original) {
    throw new Error('File content was not restored to pre-tamper state');
  }
  pass('File content restored from backup');

  const recent = await SecurityEvent.findAll({
    where: { eventType: 'file_repair_succeeded' },
    order: [['id', 'DESC']],
    limit: 10,
  });
  const succeeded = recent.find(
    (e) => Number(e.id) > eventsBefore && e.description.includes(TEST_FILE)
  );

  if (!succeeded) {
    throw new Error('No file_repair_succeeded security event logged');
  }
  pass(`Security event logged: ${succeeded.description}`);

  console.log('\nAuto-repair tamper test passed.');
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  if (fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, original, 'utf8');
  }
}
