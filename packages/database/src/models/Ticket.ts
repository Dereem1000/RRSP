import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export interface TicketAttributes {
  id: string;
  ticketNumber: string;
  clientName: string;
  clientContactNumber?: string | null;
  issue: string;
  location: string;
  deviceType: string;
  deviceModel?: string | null;
  serialNumber?: string | null;
  status: string;
  technician: string;
  notes?: string | null;
  priority?: string | null;
  category?: string | null;
  dueDate?: string | null;
  dateCreated: string;
  lastUpdated: string;
  subscription?: string | null;
  isActive: number;
  clientId?: string | null;
  createdBy?: number | null;
  assignedTo?: number | null;
  hasUnreadClientComments: boolean;
  lastClientCommentAt?: Date | null;
  attachments: unknown[];
  tags: unknown[];
  title?: string | null;
  resolutionNotes?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
}

export type TicketCreationAttributes = Optional<
  TicketAttributes,
  'id' | 'status' | 'priority' | 'category' | 'isActive' | 'hasUnreadClientComments' | 'attachments' | 'tags'
>;

export class Ticket
  extends Model<TicketAttributes, TicketCreationAttributes>
  implements TicketAttributes
{
  declare id: string;
  declare ticketNumber: string;
  declare clientName: string;
  declare clientContactNumber: string | null;
  declare issue: string;
  declare location: string;
  declare deviceType: string;
  declare deviceModel: string | null;
  declare serialNumber: string | null;
  declare status: string;
  declare technician: string;
  declare notes: string | null;
  declare priority: string | null;
  declare category: string | null;
  declare dueDate: string | null;
  declare dateCreated: string;
  declare lastUpdated: string;
  declare subscription: string | null;
  declare isActive: number;
  declare clientId: string | null;
  declare createdBy: number | null;
  declare assignedTo: number | null;
  declare hasUnreadClientComments: boolean;
  declare lastClientCommentAt: Date | null;
  declare attachments: unknown[];
  declare tags: unknown[];
  declare title: string | null;
  declare resolutionNotes: string | null;
  declare estimatedHours: number | null;
  declare actualHours: number | null;
  declare estimatedCost: number | null;
  declare actualCost: number | null;
}

Ticket.init(
  {
    id: { type: DataTypes.TEXT, primaryKey: true },
    ticketNumber: { type: DataTypes.TEXT, allowNull: false, unique: true, field: 'ticketNumber' },
    clientName: { type: DataTypes.TEXT, allowNull: false, field: 'clientName' },
    clientContactNumber: { type: DataTypes.TEXT, allowNull: true, field: 'clientContactNumber' },
    issue: { type: DataTypes.TEXT, allowNull: false, field: 'issue' },
    location: { type: DataTypes.TEXT, allowNull: false, field: 'location' },
    deviceType: { type: DataTypes.TEXT, allowNull: false, field: 'deviceType' },
    deviceModel: { type: DataTypes.TEXT, allowNull: true, field: 'deviceModel' },
    serialNumber: { type: DataTypes.TEXT, allowNull: true, field: 'serialNumber' },
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'New', field: 'status' },
    technician: { type: DataTypes.TEXT, allowNull: false, field: 'technician' },
    notes: { type: DataTypes.TEXT, allowNull: true, field: 'notes' },
    priority: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'medium', field: 'priority' },
    category: { type: DataTypes.TEXT, allowNull: true, defaultValue: 'general', field: 'category' },
    dueDate: { type: DataTypes.TEXT, allowNull: true, field: 'dueDate' },
    dateCreated: { type: DataTypes.TEXT, allowNull: false, field: 'dateCreated' },
    lastUpdated: { type: DataTypes.TEXT, allowNull: false, field: 'lastUpdated' },
    subscription: { type: DataTypes.TEXT, allowNull: true, field: 'subscription' },
    isActive: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'isActive' },
    clientId: { type: DataTypes.TEXT, allowNull: true, field: 'clientId' },
    createdBy: { type: DataTypes.INTEGER, allowNull: true, field: 'createdBy' },
    assignedTo: { type: DataTypes.INTEGER, allowNull: true, field: 'assignedTo' },
    hasUnreadClientComments: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'hasUnreadClientComments',
    },
    lastClientCommentAt: { type: DataTypes.DATE, allowNull: true, field: 'lastClientCommentAt' },
    attachments: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'attachments' },
    tags: { type: DataTypes.JSON, allowNull: false, defaultValue: [], field: 'tags' },
    title: { type: DataTypes.TEXT, allowNull: true, field: 'title' },
    resolutionNotes: { type: DataTypes.TEXT, allowNull: true, field: 'resolution_notes' },
    estimatedHours: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'estimated_hours' },
    actualHours: { type: DataTypes.DECIMAL(5, 2), allowNull: true, field: 'actual_hours' },
    estimatedCost: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'estimated_cost' },
    actualCost: { type: DataTypes.DECIMAL(10, 2), allowNull: true, field: 'actual_cost' },
  },
  {
    sequelize: getSequelize(),
    tableName: 'tickets',
    timestamps: false,
    underscored: false,
  }
);

export default Ticket;
