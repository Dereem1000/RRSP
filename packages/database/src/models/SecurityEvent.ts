import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export interface SecurityEventAttributes {
  id: number;
  eventType: string;
  severity: string;
  userId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  description: string;
  details?: Record<string, unknown>;
  outcome: string;
  isActive: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type SecurityEventCreationAttributes = Optional<
  SecurityEventAttributes,
  'id' | 'userId' | 'ipAddress' | 'userAgent' | 'details' | 'isActive'
>;

export class SecurityEvent
  extends Model<SecurityEventAttributes, SecurityEventCreationAttributes>
  implements SecurityEventAttributes
{
  declare id: number;
  declare eventType: string;
  declare severity: string;
  declare userId: number | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare description: string;
  declare details: Record<string, unknown>;
  declare outcome: string;
  declare isActive: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

SecurityEvent.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    eventType: { type: DataTypes.STRING(80), allowNull: false },
    severity: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'medium' },
    userId: DataTypes.INTEGER,
    ipAddress: DataTypes.STRING(45),
    userAgent: DataTypes.TEXT,
    description: { type: DataTypes.TEXT, allowNull: false },
    details: { type: DataTypes.JSON, defaultValue: {} },
    outcome: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'monitored' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize: getSequelize(),
    tableName: 'security_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

export default SecurityEvent;
