export const BackupConfigKeys = {
  features: 'backup_features',
  autoBackup: 'autoBackupConfig',
  lastBackup: 'last_backup',
  lastBackupFile: 'last_backup_file',
} as const;

export type BackupFeaturesConfig = {
  enabled: boolean;
  auto_backup?: boolean;
  backup_retention_days?: number;
  backup_verification?: boolean;
};

export type AutoBackupConfig = {
  enabled: boolean;
  frequency?: 'daily' | 'weekly' | 'monthly';
  time?: string;
  day?: number;
  retention?: number;
  type?: 'full' | 'database' | 'files';
  notes?: string;
  lastRun?: string | null;
  nextRun?: string | null;
  createdAt?: string;
};

export const DEFAULT_BACKUP_FEATURES: BackupFeaturesConfig = {
  enabled: true,
  auto_backup: false,
  backup_retention_days: 30,
  backup_verification: true,
};
