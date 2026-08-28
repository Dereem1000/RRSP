import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import {
  beginCrossProcessDbPause,
  clearDbPauseLock,
  getDemoWorkingPath,
  getLiveDatabasePath,
  getMonorepoRoot,
  reopenConnection,
  setActiveDatabaseFileName,
} from './connection';
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getTrashDir(): string {
  return path.join(getDemoSandboxDir(), 'trash');
}

async function removeOrQuarantine(filePath: string, attempts = 8): Promise<void> {
  if (!fs.existsSync(filePath)) return;

  for (let i = 0; i < attempts; i++) {
    try {
      fs.unlinkSync(filePath);
      return;
    } catch {
      try {
        fs.mkdirSync(getTrashDir(), { recursive: true });
        const dest = path.join(
          getTrashDir(),
          `${Date.now()}-${i}-${path.basename(filePath)}`
        );
        fs.renameSync(filePath, dest);
        return;
      } catch {
        await delay(50 * (i + 1));
      }
    }
  }
}

async function removeDbFiles(basePath: string): Promise<void> {
  for (const suffix of ['-shm', '-wal', '']) {
    await removeOrQuarantine(`${basePath}${suffix}`);
  }
}

function runSql(db: sqlite3.Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function openDb(filePath: string): Promise<sqlite3.Database> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(filePath, (err) => (err ? reject(err) : resolve(db)));
  });
}

function closeDb(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Create a self-contained copy via VACUUM INTO a unique temp path, then replace
 * dest. SQLite rejects VACUUM INTO when the output file already exists.
 */
async function copyMainDb(sourcePath: string, destPath: string): Promise<void> {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });

  const tmpPath = `${destPath}.${process.pid}.${Date.now()}.vacuum-tmp`;
  await removeDbFiles(tmpPath);

  const tmpSqlPath = tmpPath.replace(/\\/g, '/').replace(/'/g, "''");
  const db = await openDb(sourcePath);
  try {
    await runSql(db, 'PRAGMA busy_timeout = 30000');
    try {
      await runSql(db, 'PRAGMA wal_checkpoint(TRUNCATE)');
    } catch {
      // best-effort
    }
    await runSql(db, `VACUUM INTO '${tmpSqlPath}'`);
  } finally {
    await closeDb(db);
  }

  await removeDbFiles(destPath);
  try {
    fs.renameSync(tmpPath, destPath);
  } catch {
    fs.copyFileSync(tmpPath, destPath);
    await removeOrQuarantine(tmpPath);
  }
}

/** Snapshot live → working copy. Demo writes go to working.db. */
export async function enableDemoSandbox(): Promise<void> {
  if (isDemoSandboxActive()) return;

  const livePath = getLiveDatabasePath();
  if (!fs.existsSync(livePath)) {
    throw new Error('Live database not found.');
  }

  try {
    await beginCrossProcessDbPause(livePath);

    const sandboxDir = getDemoSandboxDir();
    fs.mkdirSync(sandboxDir, { recursive: true });

    const snapshotPath = getDemoSnapshotPath();
    const workingPath = getDemoWorkingPath();

    // Clear leftovers from a failed prior toggle before VACUUM INTO.
    await removeDbFiles(snapshotPath);
    await removeDbFiles(workingPath);

    await copyMainDb(livePath, snapshotPath);
    await copyMainDb(livePath, workingPath);

    fs.writeFileSync(
      getDemoActiveMarkerPath(),
      JSON.stringify(
        {
          enabled: true,
          createdAt: new Date().toISOString(),
          livePath,
          snapshotPath,
          workingPath,
        },
        null,
        2
      )
    );

    setDemoModeCache(true);
  } finally {
    clearDbPauseLock();
    await reopenConnection();
  }
}

/**
 * Discard the working copy and reopen the untouched live DB.
 * Legacy sessions (no working.db) restore via VACUUM INTO a new live file.
 */
export async function disableDemoSandbox(): Promise<void> {
  if (!isDemoSandboxActive()) return;

  const livePath = getLiveDatabasePath();
  const snapshotPath = getDemoSnapshotPath();
  const workingPath = getDemoWorkingPath();
  const hasWorkingCopy = fs.existsSync(workingPath);

  if (!hasWorkingCopy && !fs.existsSync(snapshotPath)) {
    throw new Error('Demo mode snapshot missing — cannot restore live database.');
  }

  try {
    const pauseTarget = hasWorkingCopy ? workingPath : livePath;
    await beginCrossProcessDbPause(pauseTarget);

    if (hasWorkingCopy) {
      await removeDbFiles(workingPath);
      if (fs.existsSync(snapshotPath)) await removeDbFiles(snapshotPath);
    } else {
      const restoredName = `computer_dynamics.restored-${Date.now()}.db`;
      const restoredPath = path.join(getMonorepoRoot(), 'data', restoredName);
      await copyMainDb(snapshotPath, restoredPath);
      setActiveDatabaseFileName(restoredName);

      await removeDbFiles(snapshotPath);
      await removeDbFiles(livePath);
    }

    const marker = getDemoActiveMarkerPath();
    if (fs.existsSync(marker)) fs.unlinkSync(marker);

    setDemoModeCache(false);
  } finally {
    clearDbPauseLock();
    await reopenConnection();
  }
}

export async function syncDemoModeFromMarker(): Promise<boolean> {
  const active = isDemoSandboxActive();
  setDemoModeCache(active);
  return active;
}
