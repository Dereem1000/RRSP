import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export type BackupType =
  | 'full'
  | 'incremental'
  | 'database'
  | 'files'
  | 'manual'
  | 'upload'
  | 'auto'
  | string;

export type BackupStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'verified';

export interface BackupAttributes {
  id: string;
  backupType: BackupType;
  backupName: string;
  filePath: string;
  fileSize?: number | null;
  status: BackupStatus;
  startTime: Date;
  endTime?: Date | null;
  duration?: number | null;
  checksum?: string | null;
  compressionRatio?: string | null;
  retentionDate: Date;
  isEncrypted?: boolean;
  encryptionKey?: string | null;
  notes?: string | null;
  isActive: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type BackupCreationAttributes = Optional<
  BackupAttributes,
  | 'id'
  | 'fileSize'
  | 'status'
  | 'endTime'
  | 'duration'
  | 'checksum'
  | 'compressionRatio'
  | 'isEncrypted'
  | 'encryptionKey'
  | 'notes'
  | 'isActive'
>;

export class Backup
  extends Model<BackupAttributes, BackupCreationAttributes>
  implements BackupAttributes
{
  declare id: string;
  declare backupType: BackupType;
  declare backupName: string;
  declare filePath: string;
  declare fileSize: number | null;
  declare status: BackupStatus;
  declare startTime: Date;
  declare endTime: Date | null;
  declare duration: number | null;
  declare checksum: string | null;
  declare compressionRatio: string | null;
  declare retentionDate: Date;
  declare isEncrypted: boolean;
  declare encryptionKey: string | null;
  declare notes: string | null;
  declare isActive: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

Backup.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
    backupType: { type: DataTypes.STRING(50), allowNull: false, field: 'backup_type' },
    backupName: { type: DataTypes.STRING, allowNull: false, field: 'backup_name' },
    filePath: { type: DataTypes.STRING, allowNull: false, field: 'file_path' },
    fileSize: { type: DataTypes.BIGINT, allowNull: true, field: 'file_size' },
    status: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'pending',
    },
    startTime: { type: DataTypes.DATE, allowNull: false, field: 'start_time' },
    endTime: { type: DataTypes.DATE, allowNull: true, field: 'end_time' },
    duration: DataTypes.INTEGER,
    checksum: DataTypes.STRING,
    compressionRatio: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'compression_ratio' },
    retentionDate: { type: DataTypes.DATE, allowNull: false, field: 'retention_date' },
    isEncrypted: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_encrypted' },
    encryptionKey: { type: DataTypes.STRING, allowNull: true, field: 'encryption_key' },
    notes: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize: getSequelize(),
    tableName: 'backups',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

export default Backup;
