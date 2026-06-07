import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';

/** Relative paths for file-integrity / backup catalogs. */
export function getLicenseProtectedFilePaths(): string[] {
  return [
    'license_activation_system_new/license_api_server.py',
    'license_activation_system_new/license_validator.py',
    'license_activation_system_new/license_response_signature.py',
    'license_activation_system_new/models.py',
    'apps/web/src/lib/license-api-proxy.ts',
    'apps/web/src/lib/license-service.ts',
    'apps/web/src/lib/license-constants.ts',
    'apps/web/src/app/api/license/validate/route.ts',
    'apps/web/src/app/api/license/status/route.ts',
    'apps/web/src/app/api/license/info/route.ts',
    'packages/security/src/license-monitor.ts',
    'packages/security/src/license-health.ts',
    'packages/security/src/license-db.ts',
  ];
}

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
