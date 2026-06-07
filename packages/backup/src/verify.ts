import crypto from 'crypto';
import fs from 'fs';
import unzipper from 'unzipper';

export async function calculateChecksum(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (d) => hash.update(d));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export type BackupVerification = {
  isValid: boolean;
  hasMetadata: boolean;
  hasDatabase: boolean;
  hasUploads: boolean;
  hasApp: boolean;
  fileCount: number;
  error?: string;
};

export async function verifyBackupZip(filePath: string): Promise<BackupVerification> {
  if (!fs.existsSync(filePath)) {
    return { isValid: false, hasMetadata: false, hasDatabase: false, hasUploads: false, hasApp: false, fileCount: 0, error: 'File not found' };
  }

  try {
    const directory = await unzipper.Open.file(filePath);
    const files = directory.files.map((f: { path: string }) => f.path);
    const hasMetadata = files.some((p: string) => p === 'backup-metadata.json');
    const hasDatabase = files.some((p: string) => p === 'database.db' || p.endsWith('database.db'));
    const hasUploads = files.some((p: string) => p.startsWith('uploads/'));
    const hasApp = files.some((p: string) => p.startsWith('app/') || p.startsWith('packages/'));
    const isValid = hasMetadata && (hasDatabase || hasApp);
    return {
      isValid,
      hasMetadata,
      hasDatabase,
      hasUploads,
      hasApp,
      fileCount: files.length,
    };
  } catch (err) {
    return {
      isValid: false,
      hasMetadata: false,
      hasDatabase: false,
      hasUploads: false,
      hasApp: false,
      fileCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
