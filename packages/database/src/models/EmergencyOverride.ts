import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export interface EmergencyOverrideAttributes {
  id: string;
  userId: number;
  overrideType: string;
  reason: string;
  authorizationCode: string;
  startTime: Date;
  endTime?: Date | null;
  duration?: number | null;
  status: string;
  actionsPerformed?: unknown[] | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  riskLevel?: string | null;
  postIncidentAnalysis?: string | null;
  isActive: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export type EmergencyOverrideCreationAttributes = Optional<
  EmergencyOverrideAttributes,
  'id' | 'endTime' | 'duration' | 'status' | 'actionsPerformed' | 'ipAddress' | 'userAgent' | 'riskLevel' | 'postIncidentAnalysis' | 'isActive'
>;

export class EmergencyOverride
  extends Model<EmergencyOverrideAttributes, EmergencyOverrideCreationAttributes>
  implements EmergencyOverrideAttributes
{
  declare id: string;
  declare userId: number;
  declare overrideType: string;
  declare reason: string;
  declare authorizationCode: string;
  declare startTime: Date;
  declare endTime: Date | null;
  declare duration: number | null;
  declare status: string;
  declare actionsPerformed: unknown[] | null;
  declare ipAddress: string | null;
  declare userAgent: string | null;
  declare riskLevel: string | null;
  declare postIncidentAnalysis: string | null;
  declare isActive: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

EmergencyOverride.init(
  {
    id: { type: DataTypes.STRING, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    overrideType: { type: DataTypes.STRING(50), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    authorizationCode: { type: DataTypes.STRING(255), allowNull: false },
    startTime: { type: DataTypes.DATE, allowNull: false },
    endTime: DataTypes.DATE,
    duration: DataTypes.INTEGER,
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'active' },
    actionsPerformed: { type: DataTypes.JSON, defaultValue: [] },
    ipAddress: DataTypes.STRING(255),
    userAgent: DataTypes.TEXT,
    riskLevel: { type: DataTypes.STRING(20), defaultValue: 'high' },
    postIncidentAnalysis: DataTypes.TEXT,
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_at: DataTypes.DATE,
    updated_at: DataTypes.DATE,
  },
  {
    sequelize: getSequelize(),
    tableName: 'emergency_overrides',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: true,
  }
);

export default EmergencyOverride;
