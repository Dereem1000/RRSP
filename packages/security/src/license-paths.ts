import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';

export { getLicenseProtectedFilePaths } from '@cd-v2/database';

export function getLicenseDbPath(): string {
  const root = getMonorepoRoot();
  const configured = process.env.LICENSE_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
  }
  return path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
}

export function isLicenseDbAvailable(): boolean {
  try {
    return fs.existsSync(getLicenseDbPath());
  } catch {
    return false;
  }
}

export function getLicenseApiInternalBase(): string {
  const configured = process.env.LICENSE_API_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const port = process.env.LICENSE_API_PORT?.trim() || '5001';
  return `http://127.0.0.1:${port}`;
}
