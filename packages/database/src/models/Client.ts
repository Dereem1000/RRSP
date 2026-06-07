import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export interface ClientAttributes {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  billingInfo?: Record<string, unknown>;
  contractDetails?: Record<string, unknown>;
  serviceLevel?: 'basic' | 'standard' | 'premium' | 'enterprise' | 'per-job' | null;
  supportTier: 'bronze' | 'silver' | 'gold' | 'platinum';
  status: 'active' | 'inactive' | 'suspended' | 'pending';
  startDate?: Date | null;
  endDate?: Date | null;
  monthlyRate?: number;
  notes?: string | null;
  communicationHistory?: unknown[];
  isActive: boolean;
  usageTracking?: Record<string, unknown> | null;
  features?: unknown[];
  servicePlanData?: Record<string, unknown>;
  assignedTechnicianId?: string | null;
  priorityLevel?: 'low' | 'medium' | 'high' | 'critical';
  contractStartDate?: Date | null;
  contractEndDate?: Date | null;
  renewalDate?: Date | null;
  slaAgreement?: Record<string, unknown>;
  userId?: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export type ClientCreationAttributes = Optional<
  ClientAttributes,
  'id' | 'supportTier' | 'status' | 'isActive' | 'monthlyRate'
>;

export class Client
  extends Model<ClientAttributes, ClientCreationAttributes>
  implements ClientAttributes
{
  declare id: string;
  declare name: string;
  declare companyName: string | null;
  declare email: string;
  declare phone: string | null;
  declare address: string | null;
  declare contactPerson: string | null;
  declare billingInfo: Record<string, unknown>;
  declare contractDetails: Record<string, unknown>;
  declare serviceLevel: ClientAttributes['serviceLevel'];
  declare supportTier: ClientAttributes['supportTier'];
  declare status: ClientAttributes['status'];
  declare startDate: Date | null;
  declare endDate: Date | null;
  declare monthlyRate: number;
  declare notes: string | null;
  declare communicationHistory: unknown[];
  declare isActive: boolean;
  declare usageTracking: Record<string, unknown> | null;
  declare features: unknown[];
  declare servicePlanData: Record<string, unknown>;
  declare assignedTechnicianId: string | null;
  declare priorityLevel: ClientAttributes['priorityLevel'];
  declare contractStartDate: Date | null;
  declare contractEndDate: Date | null;
  declare renewalDate: Date | null;
  declare slaAgreement: Record<string, unknown>;
  declare userId: number | null;
}

Client.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: { type: DataTypes.STRING(100), allowNull: false },
    companyName: { type: DataTypes.STRING(100), allowNull: true, field: 'company_name' },
    email: { type: DataTypes.STRING(100), allowNull: false },
    phone: DataTypes.STRING(20),
    address: DataTypes.TEXT,
    contactPerson: { type: DataTypes.STRING(100), field: 'contact_person' },
    billingInfo: { type: DataTypes.JSON, defaultValue: {}, field: 'billing_info' },
    contractDetails: {
      type: DataTypes.JSON,
      defaultValue: {},
      field: 'contract_details',
    },
    serviceLevel: {
      type: DataTypes.ENUM('basic', 'standard', 'premium', 'enterprise', 'per-job'),
      allowNull: true,
      defaultValue: null,
      field: 'service_level',
    },
    supportTier: {
      type: DataTypes.ENUM('bronze', 'silver', 'gold', 'platinum'),
      allowNull: false,
      defaultValue: 'silver',
      field: 'support_tier',
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'suspended', 'pending'),
      allowNull: false,
      defaultValue: 'active',
    },
    startDate: { type: DataTypes.DATE, field: 'start_date' },
    endDate: { type: DataTypes.DATE, field: 'end_date' },
    monthlyRate: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
      field: 'monthly_rate',
    },
    notes: DataTypes.TEXT,
    communicationHistory: {
      type: DataTypes.JSON,
      defaultValue: [],
      field: 'communication_history',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    usageTracking: { type: DataTypes.JSON, defaultValue: null, field: 'usage_tracking' },
    features: { type: DataTypes.JSON, defaultValue: [], field: 'features' },
    servicePlanData: {
      type: DataTypes.JSON,
      defaultValue: {},
      field: 'service_plan_data',
    },
    assignedTechnicianId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'assigned_technician_id',
    },
    priorityLevel: {
      type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
      defaultValue: 'medium',
      field: 'priority_level',
    },
    contractStartDate: { type: DataTypes.DATE, field: 'contract_start_date' },
    contractEndDate: { type: DataTypes.DATE, field: 'contract_end_date' },
    renewalDate: { type: DataTypes.DATE, field: 'renewal_date' },
    slaAgreement: { type: DataTypes.JSON, defaultValue: {}, field: 'sla_agreement' },
    userId: { type: DataTypes.INTEGER, allowNull: true, field: 'userId' },
  },
  {
    sequelize: getSequelize(),
    tableName: 'clients',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default Client;
