import fs from 'fs';
import { Op } from 'sequelize';
import { Backup, SystemConfig } from '@cd-v2/database';
import { AutoBackupConfig, BackupConfigKeys } from './config-keys';

export async function getAutoBackupConfig(): Promise<AutoBackupConfig | null> {
  const raw = await SystemConfig.getConfig<string | AutoBackupConfig | null>(
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

export async function enforceRetentionPolicy(): Promise<number> {
  const config = await getAutoBackupConfig();
  const days = config?.retention ?? 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const expired = await Backup.findAll({
    where: {
      retentionDate: { [Op.lt]: cutoff },
      isActive: true,
    },
  });

  let removed = 0;
  for (const b of expired) {
    if (fs.existsSync(b.filePath)) {
      try {
        fs.unlinkSync(b.filePath);
      } catch {
        /* ignore */
      }
    }
    await b.destroy();
    removed++;
  }
  return removed;
}
