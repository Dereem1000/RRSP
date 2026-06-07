import { SystemConfig } from '@cd-v2/database';
import {
  extractFileFromLatestBackup,
  snapshotFileBeforeRepair,
} from '@cd-v2/backup';
import { logSecurityEvent } from './events';
import { SecurityHttpKeys } from './http-guard';
import { snapshotFile, type FileBaseline } from './protected-files';
import { SecurityConfigKeys } from './config-keys';

export async function attemptFileRepairFromBackup(
  relativePath: string,
  reason: string
): Promise<{ repaired: boolean; message: string }> {
  const enabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.repairEnabled, false)) === true;
  if (!enabled) {
    return { repaired: false, message: 'Auto-repair disabled' };
  }

  const useBackups =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.repairUseBackups, true)) !== false;

  await logSecurityEvent({
    eventType: 'file_repair_attempted',
    severity: 'medium',
    description: `File repair attempted: ${relativePath} (${reason})`,
    details: { relativePath, reason },
  });

  snapshotFileBeforeRepair(relativePath);

  if (useBackups) {
    const result = await extractFileFromLatestBackup(relativePath);
    if (result.restored) {
      await logSecurityEvent({
        eventType: 'file_repair_succeeded',
        severity: 'low',
        description: `File restored from backup: ${relativePath}`,
        details: { source: result.source },
      });
      await rebaselineSingleFile(relativePath);
      return { repaired: true, message: `Restored from ${result.source}` };
    }
    await logSecurityEvent({
      eventType: 'file_repair_failed',
      severity: 'high',
      description: `File repair failed: ${relativePath}`,
      details: { error: result.error },
    });
    return { repaired: false, message: result.error ?? 'Backup extract failed' };
  }

  return { repaired: false, message: 'No backup source configured' };
}

async function rebaselineSingleFile(relativePath: string) {
  const snap = snapshotFile(relativePath);
  if (!snap) return;
  const baselines =
    (await SystemConfig.getConfig<Record<string, FileBaseline> | null>(
      SecurityConfigKeys.fileBaselines,
      null
    )) ?? {};
  baselines[relativePath] = snap;
  await SystemConfig.setConfig(SecurityConfigKeys.fileBaselines, baselines, 'json', 'security');
}
