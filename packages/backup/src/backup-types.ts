import type { BackupType } from '@cd-v2/database';

/** Normalized backup kinds used by create/restore logic. */
export type ResolvedBackupKind = 'standard' | 'system' | 'database' | 'files' | 'license';

/** Map legacy/UI types to the implementation kind. */
export function resolveBackupKind(backupType: BackupType): ResolvedBackupKind {
  switch (backupType) {
    case 'system':
      return 'system';
    case 'database':
      return 'database';
    case 'files':
      return 'files';
    case 'license':
      return 'license';
    case 'full':
    case 'manual':
    case 'auto':
    case 'standard':
    default:
      return 'standard';
  }
}

export function isStandardBackupKind(kind: ResolvedBackupKind): boolean {
  return kind === 'standard';
}

export function includesDatabase(kind: ResolvedBackupKind): boolean {
  return kind === 'standard' || kind === 'system' || kind === 'database';
}

export function includesLicenseDb(kind: ResolvedBackupKind): boolean {
  return kind === 'standard' || kind === 'system' || kind === 'license';
}

export function includesUploads(kind: ResolvedBackupKind): boolean {
  return kind === 'standard' || kind === 'system' || kind === 'files';
}

export function includesCriticalAppPaths(kind: ResolvedBackupKind): boolean {
  return kind === 'standard' || kind === 'system';
}

export const VALID_BACKUP_TYPES = [
  'standard',
  'full',
  'system',
  'database',
  'files',
  'license',
  'manual',
  'auto',
] as const;

export const BACKUP_TYPE_LABELS: Record<string, string> = {
  standard: 'Standard',
  full: 'Standard',
  manual: 'Standard',
  auto: 'Standard',
  system: 'Full system',
  database: 'Database',
  files: 'Files',
  license: 'License',
};
