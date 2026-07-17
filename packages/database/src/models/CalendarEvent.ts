import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export type CalendarEventType = 'sales_followup' | 'general';

export interface CalendarEventAttributes {
  id: string;
  title: string;
  notes?: string | null;
  eventType: CalendarEventType;
  scheduledAt: Date;
  opportunityId?: string | null;
  clientId?: string | null;
  createdBy?: number | null;
  completedAt?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type CalendarEventCreationAttributes = Optional<
  CalendarEventAttributes,
  'id' | 'eventType' | 'notes' | 'opportunityId' | 'clientId' | 'createdBy' | 'completedAt'
>;

export class CalendarEvent
  extends Model<CalendarEventAttributes, CalendarEventCreationAttributes>
  implements CalendarEventAttributes
{
  declare id: string;
  declare title: string;
  declare notes: string | null;
  declare eventType: CalendarEventType;
  declare scheduledAt: Date;
  declare opportunityId: string | null;
  declare clientId: string | null;
  declare createdBy: number | null;
  declare completedAt: Date | null;
  declare created_at: Date;
  declare updated_at: Date;
}

CalendarEvent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: { type: DataTypes.STRING(200), allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    eventType: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'sales_followup',
      field: 'event_type',
    },
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'scheduled_at',
    },
    opportunityId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'opportunity_id',
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'client_id',
    },
    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'created_by',
    },
    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'completed_at',
    },
  },
  {
    sequelize: getSequelize(),
    tableName: 'calendar_events',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default CalendarEvent;
