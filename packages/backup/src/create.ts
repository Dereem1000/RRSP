import archiver from 'archiver';
import fs from 'fs';
import path from 'path';
import type { BackupType } from '@cd-v2/database';
import { getMonorepoRoot } from '@cd-v2/database';
import {
  generateBackupName,
  getBackupDir,
  getUploadsDir,
  getV2CriticalPaths,
  getLicenseDbPath,
  resolveDbPath,
} from './paths';
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
        version: '2.0',
        type: 'v2_backup',
        backupType,
        platform: 'computer-dynamics-v2',
      };
      archive.append(JSON.stringify(metadata, null, 2), { name: 'backup-metadata.json' });

      const dbPath = resolveDbPath();
      const licenseDb = getLicenseDbPath();
      if (
        backupType === 'license' ||
        backupType === 'full' ||
        backupType === 'manual' ||
        backupType === 'auto'
      ) {
        if (fs.existsSync(licenseDb)) {
          const st = fs.statSync(licenseDb);
          originalSize += st.size;
          archive.file(licenseDb, { name: 'license_system.db' });
        } else if (backupType === 'license') {
          reject(new Error('License database file not found'));
          return;
        }
      }

      if (backupType === 'database' || backupType === 'full' || backupType === 'manual' || backupType === 'auto') {
        if (fs.existsSync(dbPath)) {
          const st = fs.statSync(dbPath);
          originalSize += st.size;
          archive.file(dbPath, { name: 'database.db' });
        } else if (backupType === 'database') {
          reject(new Error('Database file not found'));
          return;
        }
      }

      const uploads = getUploadsDir();
      if (backupType === 'files' || backupType === 'full' || backupType === 'manual' || backupType === 'auto') {
        if (fs.existsSync(uploads)) {
          archive.directory(uploads, 'uploads');
        } else if (backupType === 'files') {
          reject(new Error('Uploads directory not found'));
          return;
        }
      }

      if (backupType === 'full' || backupType === 'manual' || backupType === 'auto') {
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

      archive.finalize();
    } catch (e) {
      reject(e);
    }
  });
}
