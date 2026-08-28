import fs from 'fs';
import path from 'path';
import { getBackupAppPaths, getDatabasePath, getMonorepoRoot } from '@cd-v2/database';

export function getBackupDir(): string {
  const dir = path.join(getMonorepoRoot(), 'data', 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getRestoreTempDir(): string {
  const dir = path.join(getMonorepoRoot(), 'data', 'restore-temp');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getUploadsDir(): string {
  return path.join(getMonorepoRoot(), 'data', 'uploads');
}

export function getFileRepairSnapshotDir(): string {
  const dir = path.join(getMonorepoRoot(), 'data', 'file-repair-snapshots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function resolveDbPath(): string {
  return getDatabasePath();
}

export function getLicenseDbPath(): string {
  const root = getMonorepoRoot();
  const configured = process.env.LICENSE_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
  }
  return path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
}

export function getV2CriticalPaths(): string[] {
  const root = getMonorepoRoot();
  return getBackupAppPaths().filter((p) => fs.existsSync(path.join(root, p)));
}

export function generateBackupName(type: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `backup-${type}-${timestamp}.zip`;
}
