import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { Client, User } from '@cd-v2/database';

export type PublicUser = {
  id: number;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  securityClearance: string;
  isActive: boolean;
  isLocked: boolean;
  passwordSet: boolean;
  phone?: string | null;
  bio?: string | null;
  lastLoginAt?: string | null;
  created_at?: string;
  updated_at?: string;
};

const SAFE_USER_ATTRS = { exclude: ['password', 'tempPassword', 'preferences', 'emergencyContact'] };

export function serializeUser(user: User): PublicUser {
  const json = user.toJSON() as PublicUser & { lastLoginAt?: Date | null };
  return {
    ...json,
    lastLoginAt: json.lastLoginAt ? String(json.lastLoginAt) : null,
  };
}

export async function listUsers(options?: {
  role?: string;
  search?: string;
  active?: 'all' | 'active' | 'inactive';
}) {
  const where: Record<string, unknown> = {};

  if (options?.role && options.role !== 'all') {
    where.role = options.role;
  }
  if (options?.active === 'active') where.isActive = true;
  if (options?.active === 'inactive') where.isActive = false;

  if (options?.search?.trim()) {
    const q = `%${options.search.trim()}%`;
    Object.assign(where, {
      [Op.or]: [
        { username: { [Op.like]: q } },
        { email: { [Op.like]: q } },
        { firstName: { [Op.like]: q } },
        { lastName: { [Op.like]: q } },
      ],
    });
  }

  const users = await User.findAll({
    where,
    attributes: SAFE_USER_ATTRS,
    order: [
      ['role', 'ASC'],
      ['firstName', 'ASC'],
      ['lastName', 'ASC'],
    ],
  });

  return users.map(serializeUser);
}

export async function getUserById(id: number) {
  const user = await User.findByPk(id, { attributes: SAFE_USER_ATTRS });
  return user ? serializeUser(user) : null;
}

function generateTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

export async function createUser(input: {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'admin' | 'technician' | 'client';
  securityClearance: 'S-CLS1' | 'S-CLS2' | 'S-CLS3';
  password?: string;
  phone?: string | null;
  bio?: string | null;
  isActive?: boolean;
}) {
  const existing = await User.findOne({
    where: { [Op.or]: [{ username: input.username }, { email: input.email }] },
  });
  if (existing) {
    throw new Error(
      existing.username === input.username ? 'Username already exists' : 'Email already in use'
    );
  }

  const tempPassword = input.password?.trim() || generateTempPassword();
  const useTempFlow = !input.password?.trim();

  const user = await User.create({
    username: input.username.trim(),
    email: input.email.trim(),
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    role: input.role,
    securityClearance: input.securityClearance,
    password: tempPassword,
    phone: input.phone ?? null,
    bio: input.bio ?? null,
    isActive: input.isActive !== false,
    isLocked: false,
    failedLoginAttempts: 0,
    passwordSet: !useTempFlow,
    tempPassword: useTempFlow ? await bcrypt.hash(tempPassword, 12) : null,
    preferences: {},
  });

  await user.reload({ attributes: SAFE_USER_ATTRS });

  return {
    user: serializeUser(user),
    tempPassword: useTempFlow ? tempPassword : undefined,
  };
}

export async function updateUser(
  id: number,
  updates: Partial<{
    username: string;
    email: string;
    firstName: string;
    lastName: string;
    role: 'admin' | 'technician' | 'client';
    securityClearance: 'S-CLS1' | 'S-CLS2' | 'S-CLS3';
    phone: string | null;
    bio: string | null;
    isActive: boolean;
    password: string;
  }>
) {
  const user = await User.findByPk(id);
  if (!user) return null;

  if (updates.username && updates.username !== user.username) {
    const clash = await User.findOne({ where: { username: updates.username } });
    if (clash && clash.id !== id) throw new Error('Username already exists');
  }
  if (updates.email && updates.email !== user.email) {
    const clash = await User.findOne({ where: { email: updates.email } });
    if (clash && clash.id !== id) throw new Error('Email already in use');
  }

  const patch: Record<string, unknown> = { ...updates };
  if (updates.password?.trim()) {
    patch.password = updates.password.trim();
    patch.passwordSet = true;
    patch.tempPassword = null;
    patch.isLocked = false;
    patch.failedLoginAttempts = 0;
    patch.lockoutUntil = null;
  } else {
    delete patch.password;
  }

  await user.update(patch);
  await user.reload({ attributes: SAFE_USER_ATTRS });
  return serializeUser(user);
}

export async function deleteUser(id: number, actorId: number) {
  if (id === actorId) throw new Error('You cannot delete your own account');

  const user = await User.findByPk(id);
  if (!user) return false;

  const linkedClients = await Client.count({ where: { userId: id } });
  if (linkedClients > 0) {
    throw new Error('Cannot delete user linked to a client portal account. Deactivate instead.');
  }

  await user.destroy();
  return true;
}

export async function resetUserPassword(id: number) {
  const user = await User.findByPk(id);
  if (!user) return null;

  const tempPassword = generateTempPassword();
  await user.update({
    password: tempPassword,
    tempPassword: await bcrypt.hash(tempPassword, 12),
    passwordSet: false,
    isLocked: false,
    failedLoginAttempts: 0,
    lockoutUntil: null,
  });
  await user.reload({ attributes: SAFE_USER_ATTRS });

  return { user: serializeUser(user), tempPassword };
}
