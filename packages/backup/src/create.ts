import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import type { BackupType } from '@cd-v2/database';
import { getMonorepoRoot } from '@cd-v2/database';
import {
  includesCriticalAppPaths,
  includesDatabase,
  includesLicenseDb,
  includesUploads,
  resolveBackupKind,
} from './backup-types';
import {
  generateBackupName,
  getBackupDir,
  getUploadsDir,
  getV2CriticalPaths,
  getLicenseDbPath,
  resolveDbPath,
} from './paths';
import { appendSystemDataArchive, appendSystemRepoArchive } from './system-archive';
import { calculateChecksum, verifyBackupZip } from './verify';

export type CreateBackupResult = {
  filePath: string;
  backupName: string;
  fileSize: number;
  checksum: string;
  compressionRatio: string;
};

export async function createBackupZip(
  backupType: BackupType,
  destPath?: string
): Promise<CreateBackupResult> {
  const kind = resolveBackupKind(backupType);
  const backupName = destPath ? path.basename(destPath) : generateBackupName(backupType);
  const filePath = destPath ?? path.join(getBackupDir(), backupName);
  const repoRoot = getMonorepoRoot();

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    let originalSize = 0;

    output.on('close', async () => {
      try {
        const fileSize = archive.pointer();
        const checksum = await calculateChecksum(filePath);
        const verification = await verifyBackupZip(filePath);
        if (!verification.isValid) {
          reject(new Error('Backup verification failed'));
          return;
        }
        const ratio =
          originalSize > 0
            ? (((originalSize - fileSize) / originalSize) * 100).toFixed(2)
            : '0.00';
        resolve({ filePath, backupName: path.basename(filePath), fileSize, checksum, compressionRatio: ratio });
      } catch (e) {
        reject(e);
      }
    });

    archive.on('error', reject);
    archive.pipe(output);

    try {
      const metadata = {
        timestamp: new Date().toISOString(),
        version: '2.1',
        type: 'v2_backup',
        backupType,
        backupKind: kind,
        platform: 'computer-dynamics-v2',
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'backup-metadata.json' });

      const dbPath = resolveDbPath();
      const licenseDb = getLicenseDbPath();

      if (includesLicenseDb(kind)) {
        if (fs.existsSync(licenseDb)) {
          const st = fs.statSync(licenseDb);
          originalSize += st.size;
          archive.file(licenseDb, { name: 'license_system.db' });
        } else if (kind === 'license') {
          reject(new Error('License database file not found'));
          return;
        }
      }

      if (includesDatabase(kind)) {
        if (fs.existsSync(dbPath)) {
          const st = fs.statSync(dbPath);
          originalSize += st.size;
          archive.file(dbPath, { name: 'database.db' });
        } else if (kind === 'database') {
          reject(new Error('Database file not found'));
          return;
        }
      }

      const uploads = getUploadsDir();
      if (includesUploads(kind)) {
        if (fs.existsSync(uploads)) {
          archive.directory(uploads, 'uploads');
        } else if (kind === 'files') {
          reject(new Error('Uploads directory not found'));
          return;
        }
      }

      if (includesCriticalAppPaths(kind)) {
        for (const rel of getV2CriticalPaths()) {
          const abs = path.join(repoRoot, rel);
          if (fs.existsSync(abs)) {
            const st = fs.statSync(abs);
            if (st.isFile()) {
              originalSize += st.size;
              archive.file(abs, { name: `app/${rel.replace(/\\/g, '/')}` });
            }
          }
        }
      }

      if (kind === 'system') {
        appendSystemDataArchive(archive, repoRoot);
        appendSystemRepoArchive(archive, repoRoot);
      }

      archive.finalize();
    } catch (e) {
      reject(e);
    }
  });
}
