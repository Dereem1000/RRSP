import bcrypt from 'bcryptjs';
import { DataTypes, Model, Op, Optional } from 'sequelize';
import { getSequelize } from '../connection';

export interface UserAttributes {
  id: number;
  username: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'technician' | 'client';
  securityClearance: 'S-CLS1' | 'S-CLS2' | 'S-CLS3';
  isActive: boolean;
  isLocked: boolean;
  failedLoginAttempts: number;
  lastLoginAt?: Date | null;
  lockoutUntil?: Date | null;
  bio?: string | null;
  phone?: string | null;
  profilePicture?: string | null;
  emergencyContact?: Record<string, unknown> | null;
  preferences?: Record<string, unknown>;
  tempPassword?: string | null;
  passwordSet: boolean;
  firstLoginAt?: Date | null;
  created_at?: Date;
  updated_at?: Date;
}

export type UserCreationAttributes = Optional<
  UserAttributes,
  | 'id'
  | 'isActive'
  | 'isLocked'
  | 'failedLoginAttempts'
  | 'passwordSet'
  | 'preferences'
>;

export class User
  extends Model<UserAttributes, UserCreationAttributes>
  implements UserAttributes
{
  declare id: number;
  declare username: string;
  declare email: string;
  declare password: string;
  declare firstName: string;
  declare lastName: string;
  declare role: 'admin' | 'technician' | 'client';
  declare securityClearance: 'S-CLS1' | 'S-CLS2' | 'S-CLS3';
  declare isActive: boolean;
  declare isLocked: boolean;
  declare failedLoginAttempts: number;
  declare lastLoginAt: Date | null;
  declare lockoutUntil: Date | null;
  declare bio: string | null;
  declare phone: string | null;
  declare profilePicture: string | null;
  declare emergencyContact: Record<string, unknown> | null;
  declare preferences: Record<string, unknown>;
  declare tempPassword: string | null;
  declare passwordSet: boolean;
  declare firstLoginAt: Date | null;

  async validatePassword(password: string): Promise<boolean> {
    return bcrypt.compare(password, this.password);
  }

  async incrementFailedLoginAttempts(): Promise<void> {
    this.failedLoginAttempts += 1;
    if (this.failedLoginAttempts >= 5) {
      this.isLocked = true;
      this.lockoutUntil = new Date(Date.now() + 30 * 60 * 1000);
    }
    await this.save();
  }

  async resetFailedLoginAttempts(): Promise<void> {
    this.failedLoginAttempts = 0;
    this.isLocked = false;
    this.lockoutUntil = null;
    await this.save();
  }

  async updateLastLogin(): Promise<void> {
    this.lastLoginAt = new Date();
    await this.save();
  }

  static async findByCredentials(username: string, password: string): Promise<User> {
    const user = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email: username }],
      },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    if (user.isLocked && user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new Error('Account is locked. Please try again later.');
    }

    const isValid = await user.validatePassword(password);
    if (!isValid) {
      await user.incrementFailedLoginAttempts();
      throw new Error('Invalid credentials');
    }

    await user.resetFailedLoginAttempts();
    await user.updateLastLogin();
    return user;
  }
}

User.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
    email: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    password: { type: DataTypes.STRING(255), allowNull: false },
    firstName: { type: DataTypes.STRING(50), allowNull: false },
    lastName: { type: DataTypes.STRING(50), allowNull: false },
    role: {
      type: DataTypes.ENUM('admin', 'technician', 'client'),
      allowNull: false,
      defaultValue: 'client',
    },
    securityClearance: {
      type: DataTypes.ENUM('S-CLS1', 'S-CLS2', 'S-CLS3'),
      allowNull: false,
      defaultValue: 'S-CLS3',
    },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isLocked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    failedLoginAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastLoginAt: DataTypes.DATE,
    lockoutUntil: DataTypes.DATE,
    bio: DataTypes.TEXT,
    phone: DataTypes.STRING(20),
    profilePicture: DataTypes.STRING(255),
    emergencyContact: DataTypes.JSON,
    preferences: { type: DataTypes.JSON, defaultValue: {} },
    tempPassword: { type: DataTypes.STRING(255), allowNull: true, field: 'tempPassword' },
    passwordSet: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'passwordSet',
    },
    firstLoginAt: { type: DataTypes.DATE, allowNull: true, field: 'firstLoginAt' },
  },
  {
    sequelize: getSequelize(),
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    hooks: {
      beforeCreate: async (user: User) => {
        if (user.password && !user.password.startsWith('$2')) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
      beforeUpdate: async (user: User) => {
        if (
          user.changed('password') &&
          user.password &&
          !user.password.startsWith('$2')
        ) {
          user.password = await bcrypt.hash(user.password, 12);
        }
      },
    },
  }
);

export default User;
