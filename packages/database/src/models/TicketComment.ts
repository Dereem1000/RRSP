import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export type CommentType =
  | 'update'
  | 'diagnosis'
  | 'resolution'
  | 'waiting'
  | 'escalation'
  | 'general'
  | 'order_part';

export interface TicketCommentAttributes {
  id: string;
  ticketId: string;
  comment: string;
  commentType: CommentType;
  authorId: string;
  authorName: string;
  timestamp: string;
  isInternal: number;
  isActive: number;
  linkedOrderId?: string | null;
}

export type TicketCommentCreationAttributes = Optional<
  TicketCommentAttributes,
  'id' | 'commentType' | 'timestamp' | 'isInternal' | 'isActive'
>;

export class TicketComment
  extends Model<TicketCommentAttributes, TicketCommentCreationAttributes>
  implements TicketCommentAttributes
{
  declare id: string;
  declare ticketId: string;
  declare comment: string;
  declare commentType: CommentType;
  declare authorId: string;
  declare authorName: string;
  declare timestamp: string;
  declare isInternal: number;
  declare isActive: number;
  declare linkedOrderId: string | null;

  static getStatusFromCommentType(commentType: CommentType): string | null {
    const map: Record<CommentType, string | null> = {
      diagnosis: 'Diagnosed',
      resolution: 'Completed',
      waiting: 'Awaiting-Response',
      escalation: 'In-progress',
      update: 'In-progress',
      order_part: 'Awaiting-Part',
      general: null,
    };
    return map[commentType] ?? null;
  }
}

TicketComment.init(
  {
    id: { type: DataTypes.TEXT, primaryKey: true },
    ticketId: { type: DataTypes.TEXT, allowNull: false, field: 'ticketId' },
    comment: { type: DataTypes.TEXT, allowNull: false, field: 'comment' },
    commentType: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: 'update',
      field: 'commentType',
    },
    authorId: { type: DataTypes.TEXT, allowNull: false, field: 'authorId' },
    authorName: { type: DataTypes.TEXT, allowNull: false, field: 'authorName' },
    timestamp: { type: DataTypes.TEXT, allowNull: false, field: 'timestamp' },
    isInternal: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, field: 'isInternal' },
    isActive: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, field: 'isActive' },
    linkedOrderId: { type: DataTypes.TEXT, allowNull: true, field: 'linkedOrderId' },
  },
  {
    sequelize: getSequelize(),
    tableName: 'ticket_comments',
    timestamps: false,
    underscored: false,
  }
);

export default TicketComment;
