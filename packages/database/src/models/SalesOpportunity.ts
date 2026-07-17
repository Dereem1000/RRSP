import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export type SalesStage =
  | 'cold_prospect'
  | 'contact_made'
  | 'demo_completed'
  | 'proposal_sent'
  | 'won'
  | 'lost';

export type SalesProduct = 'document' | 'auto' | 'distribution' | 'ecommerce';

export type SalesDealType = 'subscription' | 'standalone';

export interface SalesOpportunityAttributes {
  id: string;
  companyName: string;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  product: SalesProduct;
  stage: SalesStage;
  dealType?: SalesDealType | null;
  monthlyRate?: number | null;
  projectValue?: number | null;
  depositAmount?: number | null;
  scopeNotes?: string | null;
  pitchNotes?: string | null;
  demoNotes?: string | null;
  contactChannel?: string | null;
  contactMadeAt?: Date | null;
  demoCompletedAt?: Date | null;
  quoteId?: string | null;
  clientId?: string | null;
  lostReason?: string | null;
  communications?: unknown[];
  createdBy?: number | null;
  assignedTo?: number | null;
  wonAt?: Date | null;
  lostAt?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type SalesOpportunityCreationAttributes = Optional<
  SalesOpportunityAttributes,
  'id' | 'stage' | 'communications'
>;

export class SalesOpportunity
  extends Model<SalesOpportunityAttributes, SalesOpportunityCreationAttributes>
  implements SalesOpportunityAttributes
{
  declare id: string;
  declare companyName: string;
  declare contactName: string;
  declare email: string | null;
  declare phone: string | null;
  declare address: string | null;
  declare product: SalesProduct;
  declare stage: SalesStage;
  declare dealType: SalesDealType | null;
  declare monthlyRate: number | null;
  declare projectValue: number | null;
  declare depositAmount: number | null;
  declare scopeNotes: string | null;
  declare pitchNotes: string | null;
  declare demoNotes: string | null;
  declare contactChannel: string | null;
  declare contactMadeAt: Date | null;
  declare demoCompletedAt: Date | null;
  declare quoteId: string | null;
  declare clientId: string | null;
  declare lostReason: string | null;
  declare communications: unknown[];
  declare createdBy: number | null;
  declare assignedTo: number | null;
  declare wonAt: Date | null;
  declare lostAt: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

SalesOpportunity.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    companyName: { type: DataTypes.STRING(150), allowNull: false, field: 'company_name' },
    contactName: { type: DataTypes.STRING(100), allowNull: false, field: 'contact_name' },
    email: { type: DataTypes.STRING(100), allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    product: {
      type: DataTypes.ENUM('document', 'auto', 'distribution', 'ecommerce'),
      allowNull: false,
    },
    stage: {
      type: DataTypes.ENUM(
        'cold_prospect',
        'contact_made',
        'demo_completed',
        'proposal_sent',
        'won',
        'lost'
      ),
      allowNull: false,
      defaultValue: 'cold_prospect',
    },
    dealType: {
      type: DataTypes.ENUM('subscription', 'standalone'),
      allowNull: true,
      field: 'deal_type',
    },
    monthlyRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'monthly_rate',
    },
    projectValue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'project_value',
    },
    depositAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'deposit_amount',
    },
    scopeNotes: { type: DataTypes.TEXT, allowNull: true, field: 'scope_notes' },
    pitchNotes: { type: DataTypes.TEXT, allowNull: true, field: 'pitch_notes' },
    demoNotes: { type: DataTypes.TEXT, allowNull: true, field: 'demo_notes' },
    contactChannel: { type: DataTypes.STRING(30), allowNull: true, field: 'contact_channel' },
    contactMadeAt: { type: DataTypes.DATE, allowNull: true, field: 'contact_made_at' },
    demoCompletedAt: { type: DataTypes.DATE, allowNull: true, field: 'demo_completed_at' },
    quoteId: { type: DataTypes.UUID, allowNull: true, field: 'quote_id' },
    clientId: { type: DataTypes.UUID, allowNull: true, field: 'client_id' },
    lostReason: { type: DataTypes.TEXT, allowNull: true, field: 'lost_reason' },
    communications: { type: DataTypes.JSON, defaultValue: [], field: 'communications' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'created_by' },
    assignedTo: { type: DataTypes.INTEGER, allowNull: true, field: 'assigned_to' },
    wonAt: { type: DataTypes.DATE, allowNull: true, field: 'won_at' },
    lostAt: { type: DataTypes.DATE, allowNull: true, field: 'lost_at' },
  },
  {
    sequelize: getSequelize(),
    tableName: 'sales_opportunities',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default SalesOpportunity;
