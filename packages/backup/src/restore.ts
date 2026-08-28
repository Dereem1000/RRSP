import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { getMonorepoRoot } from '@cd-v2/database';
import type { RestoreType } from './types';
import { getLicenseDbPath, getRestoreTempDir, getUploadsDir, resolveDbPath } from './paths';

const DATA_RESTORE_EXCLUDE = new Set(['backups', 'restore-temp', 'file-repair-snapshots']);

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.promises.mkdir(destDir, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    fs.createReadStream(zipPath)
      .pipe(unzipper.Extract({ path: destDir }))
      .on('close', () => resolve())
      .on('error', reject);
  });
}

async function copyPreRestoreSafety(targetPath: string, label: string) {
  if (!fs.existsSync(targetPath)) return;
  const parent = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const safety = path.join(parent, `pre-restore-${label}-${Date.now()}-${base}`);
  const st = fs.statSync(targetPath);
  if (st.isDirectory()) {
    fs.cpSync(targetPath, safety, { recursive: true });
  } else {
    fs.copyFileSync(targetPath, safety);
  }
}

export async function performDatabaseRestore(restoreDir: string, overwrite: boolean): Promise<void> {
  const dbBackup = path.join(restoreDir, 'database.db');
  const current = resolveDbPath();
  if (!fs.existsSync(dbBackup)) return;
  if (fs.existsSync(current) && !overwrite) {
    await copyPreRestoreSafety(current, 'db');
  }
  fs.mkdirSync(path.dirname(current), { recursive: true });
  fs.copyFileSync(dbBackup, current);
}

export async function performLicenseDbRestore(restoreDir: string, overwrite: boolean): Promise<void> {
  const licenseBackup = path.join(restoreDir, 'license_system.db');
  const current = getLicenseDbPath();
  if (!fs.existsSync(licenseBackup)) {
    throw new Error('No license_system.db in backup archive');
  }
  if (fs.existsSync(current) && !overwrite) {
    await copyPreRestoreSafety(current, 'license-db');
  }
  fs.mkdirSync(path.dirname(current), { recursive: true });
  fs.copyFileSync(licenseBackup, current);
}

export async function performFilesRestore(restoreDir: string, overwrite: boolean): Promise<void> {
  const uploadsBackup = path.join(restoreDir, 'uploads');
  const current = getUploadsDir();
  if (!fs.existsSync(uploadsBackup)) return;
  if (fs.existsSync(current) && !overwrite) {
    await copyPreRestoreSafety(current, 'uploads');
  }
  if (fs.existsSync(current)) {
    fs.rmSync(current, { recursive: true, force: true });
  }
  fs.mkdirSync(path.dirname(current), { recursive: true });
  fs.cpSync(uploadsBackup, current, { recursive: true });
}

function restoreTree(srcDir: string, relPrefix: string, destRoot: string, overwrite: boolean): void {
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const src = path.join(srcDir, ent.name);
    const dest = path.join(destRoot, rel);
    if (ent.isDirectory()) {
      restoreTree(src, rel, destRoot, overwrite);
    } else {
      if (fs.existsSync(dest) && !overwrite) {
        void copyPreRestoreSafety(dest, 'file');
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

export async function performAppFilesRestore(restoreDir: string, overwrite: boolean): Promise<void> {
  const appDir = path.join(restoreDir, 'app');
  if (!fs.existsSync(appDir)) return;
  restoreTree(appDir, '', getMonorepoRoot(), overwrite);
}

export async function performSystemDataRestore(restoreDir: string, overwrite: boolean): Promise<void> {
  const dataBackup = path.join(restoreDir, 'data');
  if (!fs.existsSync(dataBackup)) return;
  const dataRoot = path.join(getMonorepoRoot(), 'data');
  fs.mkdirSync(dataRoot, { recursive: true });

  for (const ent of fs.readdirSync(dataBackup, { withFileTypes: true })) {
    if (DATA_RESTORE_EXCLUDE.has(ent.name)) continue;
    const src = path.join(dataBackup, ent.name);
    const dest = path.join(dataRoot, ent.name);
    if (ent.isDirectory()) {
      if (fs.existsSync(dest) && !overwrite) {
        await copyPreRestoreSafety(dest, 'data-dir');
      }
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.cpSync(src, dest, { recursive: true });
    } else {
      if (fs.existsSync(dest) && !overwrite) {
        await copyPreRestoreSafety(dest, 'data-file');
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
    }
  }
}

export async function performSystemRepoRestore(restoreDir: string, overwrite: boolean): Promise<void> {
  const repoBackup = path.join(restoreDir, 'repo');
  if (!fs.existsSync(repoBackup)) return;
  restoreTree(repoBackup, '', getMonorepoRoot(), overwrite);
}

function normalizeRestoreType(restoreType: RestoreType): RestoreType {
  if (restoreType === 'full') return 'standard';
  return restoreType;
}

async function performStandardRestore(restoreDir: string, overwrite: boolean): Promise<void> {
  await performDatabaseRestore(restoreDir, overwrite);
  if (fs.existsSync(path.join(restoreDir, 'license_system.db'))) {
    await performLicenseDbRestore(restoreDir, overwrite);
  }
  await performFilesRestore(restoreDir, overwrite);
  await performAppFilesRestore(restoreDir, overwrite);
}

export async function performRestore(input: {
  zipPath: string;
  restoreType: RestoreType;
  overwrite?: boolean;
  backupId?: string;
}): Promise<void> {
  const { zipPath, restoreType, overwrite = false } = input;
  if (!fs.existsSync(zipPath)) throw new Error('Backup file not found');

  const kind = normalizeRestoreType(restoreType);
  const restoreDir = path.join(getRestoreTempDir(), `restore-${input.backupId ?? 'upload'}-${Date.now()}`);
  try {
    await extractZip(zipPath, restoreDir);
    switch (kind) {
      case 'database':
        await performDatabaseRestore(restoreDir, overwrite);
        break;
      case 'files':
        await performFilesRestore(restoreDir, overwrite);
        break;
      case 'license':
        await performLicenseDbRestore(restoreDir, overwrite);
        break;
      case 'standard':
        await performStandardRestore(restoreDir, overwrite);
        break;
      case 'system':
        await performStandardRestore(restoreDir, overwrite);
        await performSystemDataRestore(restoreDir, overwrite);
        await performSystemRepoRestore(restoreDir, overwrite);
        break;
      default:
        throw new Error(`Unknown restore type: ${restoreType}`);
    }
  } finally {
    if (fs.existsSync(restoreDir)) {
      fs.rmSync(restoreDir, { recursive: true, force: true });
    }
  }
}
