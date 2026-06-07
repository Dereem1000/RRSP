import fs from 'fs';
import path from 'path';
import { closeConnection, getLiveDatabasePath, getMonorepoRoot, reopenConnection } from './connection';
import { setDemoModeCache } from './demo-mode';

export function getDemoSandboxDir(): string {
  return path.join(getMonorepoRoot(), 'data', '.demo_mode');
}

export function getDemoSnapshotPath(): string {
  return path.join(getDemoSandboxDir(), 'snapshot.db');
}

export function getDemoActiveMarkerPath(): string {
  return path.join(getDemoSandboxDir(), 'active.json');
}

export function isDemoSandboxActive(): boolean {
  return fs.existsSync(getDemoActiveMarkerPath());
}

function copyDbFiles(sourcePath: string, destPath: string): void {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${sourcePath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.copyFileSync(sidecar, `${destPath}${suffix}`);
    }
  }
}

function removeDbFiles(basePath: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = `${basePath}${suffix}`;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

/** Snapshot the live database and allow writes against it during demo mode. */
export async function enableDemoSandbox(): Promise<void> {
  if (isDemoSandboxActive()) return;

  const livePath = getLiveDatabasePath();
  if (!fs.existsSync(livePath)) {
    throw new Error('Live database not found.');
  }

  await closeConnection();

  const sandboxDir = getDemoSandboxDir();
  fs.mkdirSync(sandboxDir, { recursive: true });

  const snapshotPath = getDemoSnapshotPath();
  copyDbFiles(livePath, snapshotPath);

  fs.writeFileSync(
    getDemoActiveMarkerPath(),
    JSON.stringify(
      {
        enabled: true,
        createdAt: new Date().toISOString(),
        livePath,
        snapshotPath,
      },
      null,
      2
    )
  );

  setDemoModeCache(true);
  await reopenConnection();
}

/** Restore the live database from the snapshot taken when demo mode was enabled. */
export async function disableDemoSandbox(): Promise<void> {
  if (!isDemoSandboxActive()) return;

  const livePath = getLiveDatabasePath();
  const snapshotPath = getDemoSnapshotPath();

  if (!fs.existsSync(snapshotPath)) {
    throw new Error('Demo mode snapshot missing — cannot restore live database.');
  }

  await closeConnection();

  copyDbFiles(snapshotPath, livePath);

  removeDbFiles(snapshotPath);

  const marker = getDemoActiveMarkerPath();
  if (fs.existsSync(marker)) fs.unlinkSync(marker);

  const sandboxDir = getDemoSandboxDir();
  if (fs.existsSync(sandboxDir) && fs.readdirSync(sandboxDir).length === 0) {
    fs.rmdirSync(sandboxDir);
  }

  setDemoModeCache(false);
  await reopenConnection();
}

export async function syncDemoModeFromMarker(): Promise<boolean> {
  const active = isDemoSandboxActive();
  setDemoModeCache(active);
  return active;
}
