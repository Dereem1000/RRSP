import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export interface NoticeBoardAttributes {
  id: number;
  title: string;
  content: string;
  authorId: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category?: string | null;
  targetAudience: 'all' | 'admin' | 'technician' | 'client' | 'custom';
  targetRoles: unknown[];
  targetUsers: unknown[];
  isPinned: boolean;
  isActive: boolean;
  publishAt: Date;
  expiresAt?: Date | null;
  attachments: unknown[];
  tags: unknown[];
}

export type NoticeBoardCreationAttributes = Optional<
  NoticeBoardAttributes,
  'id' | 'priority' | 'targetAudience' | 'targetRoles' | 'targetUsers' | 'isPinned' | 'isActive' | 'attachments' | 'tags'
>;

export class NoticeBoard
  extends Model<NoticeBoardAttributes, NoticeBoardCreationAttributes>
  implements NoticeBoardAttributes
{
  declare id: number;
  declare title: string;
  declare content: string;
  declare authorId: number;
  declare priority: NoticeBoardAttributes['priority'];
  declare category: string | null;
  declare targetAudience: NoticeBoardAttributes['targetAudience'];
  declare targetRoles: unknown[];
  declare targetUsers: unknown[];
  declare isPinned: boolean;
  declare isActive: boolean;
  declare publishAt: Date;
  declare expiresAt: Date | null;
  declare attachments: unknown[];
  declare tags: unknown[];
}

NoticeBoard.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING(200), allowNull: false },
    content: { type: DataTypes.TEXT, allowNull: false },
    authorId: { type: DataTypes.INTEGER, allowNull: false, field: 'author_id' },
    priority: {
      type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'),
      allowNull: false,
      defaultValue: 'normal',
    },
    category: DataTypes.STRING(50),
    targetAudience: {
      type: DataTypes.ENUM('all', 'admin', 'technician', 'client', 'custom'),
      allowNull: false,
      defaultValue: 'all',
      field: 'target_audience',
    },
    targetRoles: { type: DataTypes.JSON, defaultValue: [], field: 'target_roles' },
    targetUsers: { type: DataTypes.JSON, defaultValue: [], field: 'target_users' },
    isPinned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_pinned' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
    publishAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'publish_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: true, field: 'expires_at' },
    attachments: { type: DataTypes.JSON, defaultValue: [] },
    tags: { type: DataTypes.JSON, defaultValue: [] },
  },
  {
    sequelize: getSequelize(),
    tableName: 'notice_board',
    timestamps: false,
    underscored: true,
  }
);

export default NoticeBoard;
