import { DataTypes, Model, Optional } from 'sequelize';
import { getSequelize } from '../connection';
import { setDemoModeCache } from '../demo-mode';

export interface SystemConfigAttributes {
  id: number;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'array';
  category: string;
  description?: string | null;
  isEditable: boolean;
  isPublic: boolean;
  requiresRestart: boolean;
  validation?: Record<string, unknown>;
  defaultValue?: string | null;
  isActive: boolean;
}

export type SystemConfigCreationAttributes = Optional<
  SystemConfigAttributes,
  'id' | 'type' | 'category' | 'isEditable' | 'isPublic' | 'requiresRestart' | 'isActive'
>;

export class SystemConfig
  extends Model<SystemConfigAttributes, SystemConfigCreationAttributes>
  implements SystemConfigAttributes
{
  declare id: number;
  declare key: string;
  declare value: string;
  declare type: SystemConfigAttributes['type'];
  declare category: string;
  declare description: string | null;
  declare isEditable: boolean;
  declare isPublic: boolean;
  declare requiresRestart: boolean;
  declare validation: Record<string, unknown>;
  declare defaultValue: string | null;
  declare isActive: boolean;

  static async getConfig<T = unknown>(key: string, defaultValue: T | null = null): Promise<T | null> {
    try {
      const config = await SystemConfig.findOne({ where: { key, isActive: true } });
      if (!config) return defaultValue;

      switch (config.type) {
        case 'boolean':
          return (config.value === 'true') as T;
        case 'number':
          return parseFloat(config.value) as T;
        case 'json':
        case 'array':
          return JSON.parse(config.value) as T;
        default:
          return config.value as T;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('no such table')) {
        return defaultValue;
      }
      throw error;
    }
  }

  static async setConfig(
    key: string,
    value: unknown,
    type: SystemConfigAttributes['type'] = 'string',
    category = 'general'
  ) {
    const stringValue = type === 'json' || type === 'array' ? JSON.stringify(value) : String(value);
    const [config, created] = await SystemConfig.findOrCreate({
      where: { key },
      defaults: {
        key,
        value: stringValue,
        type,
        category,
        isActive: true,
        isEditable: true,
        isPublic: false,
        requiresRestart: false,
      },
    });
    if (!created) {
      await config.update({ value: stringValue, type, category });
    }

    if (key === 'demo_mode') {
      setDemoModeCache(stringValue === 'true');
    }

    return config;
  }

  static async getByCategory(category: string) {
    return SystemConfig.findAll({ where: { category, isActive: true }, order: [['key', 'ASC']] });
  }
}

SystemConfig.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    value: { type: DataTypes.TEXT, allowNull: false },
    type: {
      type: DataTypes.ENUM('string', 'number', 'boolean', 'json', 'array'),
      allowNull: false,
      defaultValue: 'string',
    },
    category: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'general' },
    description: DataTypes.TEXT,
    isEditable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_editable' },
    isPublic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_public' },
    requiresRestart: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'requires_restart',
    },
    validation: { type: DataTypes.JSON, defaultValue: {} },
    defaultValue: { type: DataTypes.TEXT, field: 'default_value' },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'is_active' },
  },
  {
    sequelize: getSequelize(),
    tableName: 'system_configs',
    underscored: true,
  }
);

export default SystemConfig;
