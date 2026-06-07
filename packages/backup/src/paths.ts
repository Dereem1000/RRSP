import fs from 'fs';
import path from 'path';
import { getDatabasePath, getMonorepoRoot } from '@cd-v2/database';

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
  const rel = [
    'package.json',
    'start.bat',
    'stop.bat',
    'packages/database/src/connection.ts',
    'packages/database/src/models/User.ts',
    'packages/database/src/models/SystemConfig.ts',
    'packages/database/src/models/Backup.ts',
    'packages/database/src/models/EmergencyOverride.ts',
    'packages/database/src/models/SecurityEvent.ts',
    'packages/security/package.json',
    'packages/security/src/worker.ts',
    'packages/security/src/monitoring.ts',
    'packages/security/src/emergency.ts',
    'packages/security/src/auth.ts',
    'packages/security/src/protected-files.ts',
    'packages/backup/package.json',
    'packages/backup/src/create.ts',
    'packages/backup/src/restore.ts',
    'license_activation_system_new/license_api_server.py',
    'license_activation_system_new/license_validator.py',
    'license_activation_system_new/license_response_signature.py',
    'apps/web/src/lib/license-api-proxy.ts',
    'apps/web/src/lib/license-service.ts',
    'apps/web/src/middleware.ts',
    'apps/web/src/lib/auth.ts',
    'apps/web/src/lib/jwt.ts',
  ];
  return rel.filter((p) => fs.existsSync(path.join(root, p)));
}

export function generateBackupName(type: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `backup-${type}-${timestamp}.zip`;
}
