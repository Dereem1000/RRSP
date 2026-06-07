import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import { Backup, SystemConfig, type BackupType } from '@cd-v2/database';
import {
  BackupConfigKeys,
  DEFAULT_BACKUP_FEATURES,
  type BackupFeaturesConfig,
} from './config-keys';
import { createBackupZip } from './create';
import { generateBackupName, getBackupDir } from './paths';
import { performRestore } from './restore';
import type { RestoreType } from './types';
import { calculateChecksum, verifyBackupZip } from './verify';

export async function isBackupEnabled(): Promise<boolean> {
  if (process.env.BACKUP_ENABLED === 'false') return false;
  const features = await SystemConfig.getConfig<BackupFeaturesConfig>(
    BackupConfigKeys.features,
    DEFAULT_BACKUP_FEATURES
  );
  return features?.enabled !== false;
}

export async function listBackups(options: {
  page?: number;
  limit?: number;
  status?: string;
  backupType?: string;
}) {
  const page = options.page ?? 1;
  const limit = options.limit ?? 50;
  const offset = (page - 1) * limit;
  const where: Record<string, unknown> = { isActive: true };
  if (options.status) where.status = options.status;
  if (options.backupType) where.backupType = options.backupType;

  const result = await Backup.findAndCountAll({
    where,
    limit,
    offset,
    order: [['created_at', 'DESC']],
  });

  return {
    backups: result.rows,
    pagination: {
      total: result.count,
      page,
      limit,
      pages: Math.ceil(result.count / limit) || 1,
    },
  };
}

export async function getBackupById(id: string) {
  return Backup.findByPk(id);
}

export async function createBackupJob(backupType: BackupType, notes?: string): Promise<Backup> {
  const dir = getBackupDir();
  const backupName = generateBackupName(backupType);
  const filePath = path.join(dir, backupName);
  const retentionDays =
    (await SystemConfig.getConfig<BackupFeaturesConfig>(BackupConfigKeys.features, DEFAULT_BACKUP_FEATURES))
      ?.backup_retention_days ?? 30;

  const backup = await Backup.create({
    id: randomUUID(),
    backupType,
    backupName,
    filePath,
    startTime: new Date(),
    status: 'in_progress',
    notes: notes ?? null,
    retentionDate: new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000),
  });

  try {
    const result = await createBackupZip(backupType, filePath);
    await backup.update({
      status: 'completed',
      endTime: new Date(),
      duration: Math.floor((Date.now() - backup.startTime.getTime()) / 1000),
      fileSize: result.fileSize,
      checksum: result.checksum,
      compressionRatio: result.compressionRatio,
    });
    await SystemConfig.setConfig(BackupConfigKeys.lastBackup, new Date().toISOString(), 'string', 'backup');
    await SystemConfig.setConfig(BackupConfigKeys.lastBackupFile, backup.id, 'string', 'backup');
  } catch (err) {
    await backup.update({
      status: 'failed',
      endTime: new Date(),
      notes: `Backup failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    throw err;
  }

  return backup;
}

export async function deleteBackup(id: string): Promise<void> {
  const backup = await Backup.findByPk(id);
  if (!backup) throw new Error('Backup not found');
  if (fs.existsSync(backup.filePath)) fs.unlinkSync(backup.filePath);
  await backup.destroy();
}

export async function verifyBackupById(id: string) {
  const backup = await Backup.findByPk(id);
  if (!backup) throw new Error('Backup not found');
  if (!fs.existsSync(backup.filePath)) throw new Error('Backup file not found on disk');

  const verification = await verifyBackupZip(backup.filePath);
  const checksum = await calculateChecksum(backup.filePath);

  if (verification.isValid) {
    await backup.update({
      status: 'verified',
      checksum,
      notes: `Verified: ${verification.fileCount} entries`,
    });
  } else {
    await backup.update({
      status: 'failed',
      notes: verification.error ?? 'Verification failed',
    });
  }

  return { backup, verification };
}

export async function restoreBackupById(
  id: string,
  restoreType: RestoreType,
  overwrite = false
): Promise<void> {
  const backup = await Backup.findByPk(id);
  if (!backup) throw new Error('Backup not found');
  if (!fs.existsSync(backup.filePath)) throw new Error('Backup file missing');
  await performRestore({
    zipPath: backup.filePath,
    restoreType,
    overwrite,
    backupId: backup.id,
  });
}

export async function restoreFromUpload(
  zipPath: string,
  restoreType: RestoreType,
  overwrite = false
): Promise<void> {
  await performRestore({ zipPath, restoreType, overwrite, backupId: 'upload' });
}

export async function getBackupStatus() {
  const enabled = await isBackupEnabled();
  const lastBackup = await SystemConfig.getConfig<string | null>(BackupConfigKeys.lastBackup, null);
  const backups = await Backup.findAll({ where: { isActive: true } });
  const totalSize = backups.reduce((s, b) => s + Number(b.fileSize ?? 0), 0);
  return {
    enabled,
    totalBackups: backups.length,
    totalSize,
    lastBackup,
  };
}

export async function getBackupProgress(id: string) {
  const backup = await Backup.findByPk(id);
  if (!backup) throw new Error('Backup not found');

  let progress = 0;
  let message = '';
  switch (backup.status) {
    case 'pending':
      progress = 0;
      message = 'Waiting…';
      break;
    case 'in_progress':
      progress = backup.startTime
        ? Math.min(90, Math.floor((Date.now() - backup.startTime.getTime()) / 1000 / 10))
        : 10;
      message = 'In progress…';
      break;
    case 'completed':
    case 'verified':
      progress = 100;
      message = 'Complete';
      break;
    case 'failed':
      progress = 0;
      message = backup.notes ?? 'Failed';
      break;
    default:
      message = backup.status;
  }

  return { progress, status: backup.status, message, backup };
}
