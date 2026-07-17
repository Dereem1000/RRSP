import { SystemConfig, type BackupType } from '@cd-v2/database';
import {
  BackupConfigKeys,
  DEFAULT_AUTO_BACKUP_CONFIG,
  type AutoBackupConfig,
} from './config-keys';
import { createBackupJob, isBackupEnabled } from './service';
import { enforceRetentionPolicy } from './retention';

function calculateNextRun(config: AutoBackupConfig): Date | null {
  if (!config.enabled || !config.frequency) return null;
  const next = new Date();
  const [h, m] = (config.time ?? '02:00').split(':').map(Number);
  next.setHours(h || 2, m || 0, 0, 0);
  if (config.frequency === 'daily') {
    if (next <= new Date()) next.setDate(next.getDate() + 1);
  } else if (config.frequency === 'weekly') {
    const targetDay = config.day ?? 0;
    while (next.getDay() !== targetDay || next <= new Date()) {
      next.setDate(next.getDate() + 1);
    }
  } else if (config.frequency === 'monthly') {
    next.setDate(1);
    if (next <= new Date()) next.setMonth(next.getMonth() + 1);
  }
  return next;
}

export async function saveAutoBackupConfig(config: AutoBackupConfig): Promise<AutoBackupConfig> {
  const nextRun = config.enabled ? calculateNextRun(config) : null;
  const stored: AutoBackupConfig = {
    ...config,
    nextRun: nextRun?.toISOString() ?? null,
  };
  await SystemConfig.setConfig(BackupConfigKeys.autoBackup, stored, 'json', 'backup');
  return stored;
}

export async function getAutoBackupConfigParsed(): Promise<AutoBackupConfig | null> {
  const raw = await SystemConfig.getConfig<AutoBackupConfig | string | null>(
    BackupConfigKeys.autoBackup,
    null
  );
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as AutoBackupConfig;
    } catch {
      return null;
    }
  }
  return raw;
}

/** Seed daily auto-backup defaults when none exist yet. */
export async function ensureAutoBackupConfig(): Promise<AutoBackupConfig> {
  const existing = await getAutoBackupConfigParsed();
  if (existing) return existing;
  return saveAutoBackupConfig({
    ...DEFAULT_AUTO_BACKUP_CONFIG,
    createdAt: new Date().toISOString(),
  });
}

export async function maybeRunAutoBackup(): Promise<boolean> {
  if (!(await isBackupEnabled())) return false;

  const config = await ensureAutoBackupConfig();
  if (!config.enabled) return false;

  const now = new Date();
  const nextRun = config.nextRun ? new Date(config.nextRun) : calculateNextRun(config);
  if (nextRun && nextRun > now) return false;

  try {
    const backupType = (config.type ?? 'full') as BackupType;
    await createBackupJob(backupType, 'Scheduled auto-backup');
    await enforceRetentionPolicy();
    const updated: AutoBackupConfig = {
      ...config,
      lastRun: now.toISOString(),
      nextRun: calculateNextRun(config)?.toISOString() ?? null,
    };
    await SystemConfig.setConfig(BackupConfigKeys.autoBackup, updated, 'json', 'backup');
    return true;
  } catch (err) {
    console.error('[cd-backup] Auto backup failed:', err);
    return false;
  }
}
