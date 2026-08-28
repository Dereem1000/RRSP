import fs from 'fs';
import path from 'path';
import unzipper from 'unzipper';
import { getMonorepoRoot } from '@cd-v2/database';
import type { RestoreType } from './types';
import { getLicenseDbPath, getRestoreTempDir, getUploadsDir, resolveDbPath } from './paths';

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

function restoreAppTree(srcDir: string, relPrefix: string, repoRoot: string, overwrite: boolean): void {
  for (const ent of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name;
    const src = path.join(srcDir, ent.name);
    const dest = path.join(repoRoot, rel);
    if (ent.isDirectory()) {
      restoreAppTree(src, rel, repoRoot, overwrite);
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
  restoreAppTree(appDir, '', getMonorepoRoot(), overwrite);
}

export async function performRestore(input: {
  zipPath: string;
  restoreType: RestoreType;
  overwrite?: boolean;
  backupId?: string;
}): Promise<void> {
  const { zipPath, restoreType, overwrite = false } = input;
  if (!fs.existsSync(zipPath)) throw new Error('Backup file not found');

  const restoreDir = path.join(getRestoreTempDir(), `restore-${input.backupId ?? 'upload'}-${Date.now()}`);
  try {
    await extractZip(zipPath, restoreDir);
    switch (restoreType) {
      case 'database':
        await performDatabaseRestore(restoreDir, overwrite);
        break;
      case 'files':
        await performFilesRestore(restoreDir, overwrite);
        break;
      case 'license':
        await performLicenseDbRestore(restoreDir, overwrite);
        break;
      case 'full':
        await performDatabaseRestore(restoreDir, overwrite);
        if (fs.existsSync(path.join(restoreDir, 'license_system.db'))) {
          await performLicenseDbRestore(restoreDir, overwrite);
        }
        await performFilesRestore(restoreDir, overwrite);
        await performAppFilesRestore(restoreDir, overwrite);
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
