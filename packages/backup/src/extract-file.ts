import fs from 'fs';
import path from 'path';
import { Op } from 'sequelize';
import { Backup } from '@cd-v2/database';
import unzipper from 'unzipper';
import { getMonorepoRoot } from '@cd-v2/database';

/** ZIP entry names for protected paths use app/ prefix */
function zipEntryForRelative(relativePath: string): string {
  return `app/${relativePath.replace(/\\/g, '/')}`;
}

export async function findLatestCompletedBackup(): Promise<Backup | null> {
  return Backup.findOne({
    where: {
      status: { [Op.in]: ['completed', 'verified'] },
      isActive: true,
    },
    order: [['created_at', 'DESC']],
  });
}

export async function extractFileFromLatestBackup(relativePath: string): Promise<{
  restored: boolean;
  source?: string;
  error?: string;
}> {
  const backup = await findLatestCompletedBackup();
  if (!backup || !fs.existsSync(backup.filePath)) {
    return { restored: false, error: 'No completed backup available' };
  }

  const entryName = zipEntryForRelative(relativePath);
  const destPath = path.join(getMonorepoRoot(), relativePath);

  try {
    const directory = await unzipper.Open.file(backup.filePath);
    const entry = directory.files.find(
      (f: { path: string }) => f.path === entryName || f.path.endsWith(relativePath)
    );
    if (!entry) {
      return { restored: false, error: `Path not found in backup: ${entryName}` };
    }

    const buf = await entry.buffer();
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, buf);
    return { restored: true, source: backup.backupName };
  } catch (err) {
    return {
      restored: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function snapshotFileBeforeRepair(relativePath: string): string | null {
  const full = path.join(getMonorepoRoot(), relativePath);
  if (!fs.existsSync(full)) return null;
  const snapDir = path.join(getMonorepoRoot(), 'data', 'file-repair-snapshots');
  fs.mkdirSync(snapDir, { recursive: true });
  const snapPath = path.join(snapDir, `${relativePath.replace(/[/\\]/g, '_')}.${Date.now()}.bak`);
  fs.mkdirSync(path.dirname(snapPath), { recursive: true });
  fs.copyFileSync(full, snapPath);
  return snapPath;
}
