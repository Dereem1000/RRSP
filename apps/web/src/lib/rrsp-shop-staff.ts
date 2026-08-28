import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { Client, User } from '@cd-v2/database';
import { normalizeServicePlanData, RRSP_MODULES, type RrspModule } from '@/lib/rrsp';
import { getRrspPortalBranding } from '@/lib/rrsp-branding';
import { parseRrspBranding } from '@/lib/rrsp-branding-shared';

export type RrspShopLoginPublicInfo = {
  companyName: string;
  logoUrl: string | null;
  hasCustomLogo: boolean;
  staffLoginEnabled: boolean;
  shopLoginSlug: string;
};

/** Public shop login page metadata — no internal IDs. */
export async function getRrspShopLoginPublicInfo(
  rawSlug: string
): Promise<RrspShopLoginPublicInfo | null> {
  const shopLoginSlug = normalizeRrspShopLoginSlug(rawSlug);
  if (!shopLoginSlug) return null;

  const mspClientId = await findMspClientIdByShopLoginSlug(shopLoginSlug);
  if (!mspClientId) return null;

  const settings = await getRrspShopStaffSettingsForClient(mspClientId);
  if (!settings?.staffLoginEnabled) return null;

  const branding = await getRrspPortalBranding(mspClientId);
  return {
    companyName: branding.companyName || shopLoginSlug,
    logoUrl: branding.logoUrl,
    hasCustomLogo: branding.hasCustomLogo,
    staffLoginEnabled: true,
    shopLoginSlug,
  };
}

export function shopStaffLoginPath(slug: string | null | undefined): string {
  const normalized = slug ? normalizeRrspShopLoginSlug(slug) : '';
  return normalized ? `/login/shop/${encodeURIComponent(normalized)}` : '/login';
}

export const RRSP_SHOP_STAFF_PREF_KEY = 'rrspShopStaff';

export type RrspShopStaffPreferences = {
  mspClientId: string;
  ownerUserId: number;
  roleLabel: string;
  modules: RrspModule[];
};

export type RrspShopStaffMember = {
  id: number;
  username: string;
  localUsername: string;
  email: string;
  firstName: string;
  lastName: string;
  roleLabel: string;
  modules: RrspModule[];
  isActive: boolean;
  passwordSet: boolean;
};

export type RrspShopStaffSettings = {
  staffLoginEnabled: boolean;
  shopLoginSlug: string;
};

export function normalizeRrspShopLoginSlug(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '')
    .replace(/-+/g, '')
    .toLowerCase()
    .slice(0, 48);
}

export function parseRrspShopStaffPreferences(
  preferences: unknown
): RrspShopStaffPreferences | null {
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) return null;
  const raw = (preferences as Record<string, unknown>)[RRSP_SHOP_STAFF_PREF_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const mspClientId = String(obj.mspClientId ?? '').trim();
  const ownerUserId = Number(obj.ownerUserId);
  const roleLabel = String(obj.roleLabel ?? '').trim();
  const modules = Array.isArray(obj.modules)
    ? obj.modules
        .map((m) => String(m))
        .filter((m): m is RrspModule => (RRSP_MODULES as readonly string[]).includes(m))
    : [];
  if (!mspClientId || !Number.isFinite(ownerUserId) || ownerUserId <= 0) return null;
  return {
    mspClientId,
    ownerUserId,
    roleLabel: roleLabel || 'Staff',
    modules,
  };
}

export function parseRrspStaffLoginEnabled(plan: Record<string, unknown>): boolean {
  return Boolean(plan.rrspStaffLoginEnabled);
}

export function parseRrspShopLoginSlugFromPlan(
  plan: Record<string, unknown>,
  client?: { name?: string | null; companyName?: string | null }
): string {
  const stored = String(plan.rrspShopLoginSlug ?? '').trim();
  if (stored) return stored;
  const branding = parseRrspBranding(plan, client);
  return normalizeRrspShopLoginSlug(branding.companyName || client?.companyName || client?.name || '');
}

export function parseRrspShopStaffSettings(
  servicePlanData: unknown,
  client?: { name?: string | null; companyName?: string | null }
): RrspShopStaffSettings {
  const plan = normalizeServicePlanData(servicePlanData);
  return {
    staffLoginEnabled: parseRrspStaffLoginEnabled(plan),
    shopLoginSlug: parseRrspShopLoginSlugFromPlan(plan, client),
  };
}

export function splitRrspShopLoginUsername(username: string): { local: string; slug: string } | null {
  const trimmed = String(username || '').trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0 || at >= trimmed.length - 1) return null;
  const local = trimmed.slice(0, at).trim().toLowerCase();
  const slug = trimmed.slice(at + 1).trim().toLowerCase();
  if (!local || !slug) return null;
  if (!/^[a-z0-9._-]+$/.test(local)) return null;
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return { local, slug };
}

export function buildRrspShopStaffUsername(localUsername: string, shopLoginSlug: string): string {
  const local = normalizeRrspShopStaffLocalUsername(localUsername);
  const slug = normalizeRrspShopLoginSlug(shopLoginSlug);
  if (!local || !slug) throw new Error('Username and shop name are required');
  return `${local}@${slug}`;
}

export function normalizeRrspShopStaffLocalUsername(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 32);
}

export function parseLocalUsernameFromStaffUser(username: string, shopLoginSlug: string): string {
  const slug = normalizeRrspShopLoginSlug(shopLoginSlug);
  const lower = String(username || '').toLowerCase();
  const suffix = `@${slug}`;
  if (lower.endsWith(suffix)) return lower.slice(0, -suffix.length);
  const split = splitRrspShopLoginUsername(username);
  return split?.local ?? username;
}

export async function isRrspShopStaffUserId(userId: number): Promise<boolean> {
  const user = await User.findByPk(userId, { attributes: ['preferences'] });
  return Boolean(parseRrspShopStaffPreferences(user?.preferences));
}

export async function getRrspShopStaffPreferencesForUser(
  userId: number
): Promise<RrspShopStaffPreferences | null> {
  const user = await User.findByPk(userId, { attributes: ['preferences'] });
  if (!user) return null;
  return parseRrspShopStaffPreferences(user.preferences);
}

export async function isRrspShopOwnerUserId(userId: number): Promise<boolean> {
  const client = await Client.findOne({ where: { userId }, attributes: ['id'] });
  return Boolean(client);
}

export async function getRrspShopOwnerUserId(mspClientId: string): Promise<number | null> {
  const client = await Client.findByPk(mspClientId, { attributes: ['userId'] });
  return client?.userId ?? null;
}

export async function loadRrspShopClient(mspClientId: string) {
  const client = await Client.findByPk(mspClientId, {
    attributes: ['id', 'name', 'companyName', 'email', 'servicePlanData', 'userId', 'features'],
  });
  if (!client) return null;
  const plan = normalizeServicePlanData(client.servicePlanData);
  return { client, plan };
}

export async function findMspClientIdByShopLoginSlug(slug: string): Promise<string | null> {
  const normalized = normalizeRrspShopLoginSlug(slug);
  if (!normalized) return null;

  const clients = await Client.findAll({
    attributes: ['id', 'name', 'companyName', 'servicePlanData', 'features'],
  });

  for (const client of clients) {
    const plan = normalizeServicePlanData(client.servicePlanData);
    if (!parseRrspStaffLoginEnabled(plan)) continue;
    const clientSlug = parseRrspShopLoginSlugFromPlan(plan, client);
    if (clientSlug === normalized) return client.id;
  }
  return null;
}

export async function resolveRrspShopLoginUser(username: string): Promise<User | null> {
  const split = splitRrspShopLoginUsername(username);
  if (!split) return null;

  const mspClientId = await findMspClientIdByShopLoginSlug(split.slug);
  if (!mspClientId) return null;

  const loaded = await loadRrspShopClient(mspClientId);
  if (!loaded || !parseRrspStaffLoginEnabled(loaded.plan)) return null;

  const fullUsername = buildRrspShopStaffUsername(split.local, split.slug);
  return User.findOne({ where: { username: fullUsername } });
}

export function filterStaffModules(
  licensedModules: RrspModule[],
  assigned: RrspModule[]
): RrspModule[] {
  const licensed = new Set(licensedModules);
  return assigned.filter((m) => licensed.has(m));
}

export async function getRrspShopStaffSettingsForClient(mspClientId: string): Promise<RrspShopStaffSettings | null> {
  const loaded = await loadRrspShopClient(mspClientId);
  if (!loaded) return null;
  return parseRrspShopStaffSettings(loaded.plan, loaded.client);
}

export async function saveRrspStaffLoginSettings(
  mspClientId: string,
  updates: Partial<{ staffLoginEnabled: boolean; shopLoginSlug?: string }>
): Promise<RrspShopStaffSettings> {
  const loaded = await loadRrspShopClient(mspClientId);
  if (!loaded) throw new Error('Client not found');

  const current = parseRrspShopStaffSettings(loaded.plan, loaded.client);
  const nextSlug =
    updates.shopLoginSlug !== undefined
      ? normalizeRrspShopLoginSlug(updates.shopLoginSlug)
      : current.shopLoginSlug;

  if (!nextSlug) {
    throw new Error('Set a business name before enabling staff login');
  }

  const plan = {
    ...loaded.plan,
    rrspStaffLoginEnabled:
      updates.staffLoginEnabled !== undefined
        ? Boolean(updates.staffLoginEnabled)
        : current.staffLoginEnabled,
    rrspShopLoginSlug: nextSlug,
  };

  await loaded.client.update({ servicePlanData: plan });
  return {
    staffLoginEnabled: parseRrspStaffLoginEnabled(plan),
    shopLoginSlug: nextSlug,
  };
}

function generateTempPassword() {
  return Math.random().toString(36).slice(2, 10);
}

export async function listRrspShopStaff(mspClientId: string): Promise<RrspShopStaffMember[]> {
  const settings = await getRrspShopStaffSettingsForClient(mspClientId);
  if (!settings) return [];

  const users = await User.findAll({
    where: {
      role: 'client',
    },
    attributes: [
      'id',
      'username',
      'email',
      'firstName',
      'lastName',
      'isActive',
      'passwordSet',
      'preferences',
    ],
    order: [['firstName', 'ASC'], ['lastName', 'ASC']],
  });

  const staff: RrspShopStaffMember[] = [];
  for (const user of users) {
    const pref = parseRrspShopStaffPreferences(user.preferences);
    if (!pref || pref.mspClientId !== mspClientId) continue;
    staff.push({
      id: user.id,
      username: user.username,
      localUsername: parseLocalUsernameFromStaffUser(user.username, settings.shopLoginSlug),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roleLabel: pref.roleLabel,
      modules: pref.modules,
      isActive: user.isActive,
      passwordSet: user.passwordSet,
    });
  }
  return staff;
}

export async function createRrspShopStaffMember(
  mspClientId: string,
  ownerUserId: number,
  input: {
    localUsername: string;
    firstName: string;
    lastName: string;
    roleLabel: string;
    modules: RrspModule[];
    password?: string;
    email?: string;
  },
  licensedModules: RrspModule[]
): Promise<{ staff: RrspShopStaffMember; tempPassword?: string }> {
  const loaded = await loadRrspShopClient(mspClientId);
  if (!loaded) throw new Error('Shop not found');

  const settings = parseRrspShopStaffSettings(loaded.plan, loaded.client);
  if (!settings.staffLoginEnabled) {
    throw new Error('Enable staff login in Business info before adding staff');
  }

  const local = normalizeRrspShopStaffLocalUsername(input.localUsername);
  if (!local) throw new Error('Enter a username for staff login');

  const username = buildRrspShopStaffUsername(local, settings.shopLoginSlug);
  const existing = await User.findOne({ where: { username } });
  if (existing) throw new Error('That staff username is already in use for your shop');

  const modules = filterStaffModules(licensedModules, input.modules);
  if (!modules.length) throw new Error('Select at least one RRSP page for this staff member');

  const roleLabel = String(input.roleLabel || '').trim() || 'Staff';
  const email =
    String(input.email || '').trim() ||
    `${local}@${settings.shopLoginSlug}.rrsp.local`;

  const emailClash = await User.findOne({ where: { email } });
  if (emailClash) throw new Error('Email already in use');

  const useProvidedPassword = Boolean(input.password?.trim());
  const tempPassword = useProvidedPassword ? input.password!.trim() : generateTempPassword();
  const hashed = await bcrypt.hash(tempPassword, 12);

  const user = await User.create({
    username,
    email,
    password: hashed,
    firstName: String(input.firstName || '').trim() || local,
    lastName: String(input.lastName || '').trim() || 'Staff',
    role: 'client',
    securityClearance: 'S-CLS3',
    isActive: true,
    isLocked: false,
    failedLoginAttempts: 0,
    passwordSet: useProvidedPassword,
    tempPassword: useProvidedPassword ? null : hashed,
    phone: null,
    preferences: {
      rrspShopStaff: {
        mspClientId,
        ownerUserId,
        roleLabel,
        modules,
      },
    },
  });

  const staff: RrspShopStaffMember = {
    id: user.id,
    username,
    localUsername: local,
    email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleLabel,
    modules,
    isActive: true,
    passwordSet: user.passwordSet,
  };

  return {
    staff,
    tempPassword: useProvidedPassword ? undefined : tempPassword,
  };
}

export async function updateRrspShopStaffMember(
  mspClientId: string,
  staffUserId: number,
  updates: Partial<{
    localUsername: string;
    firstName: string;
    lastName: string;
    roleLabel: string;
    modules: RrspModule[];
    isActive: boolean;
    password: string;
  }>,
  licensedModules: RrspModule[]
): Promise<RrspShopStaffMember> {
  const loaded = await loadRrspShopClient(mspClientId);
  if (!loaded) throw new Error('Shop not found');

  const settings = parseRrspShopStaffSettings(loaded.plan, loaded.client);
  const user = await User.findByPk(staffUserId);
  if (!user) throw new Error('Staff member not found');

  const pref = parseRrspShopStaffPreferences(user.preferences);
  if (!pref || pref.mspClientId !== mspClientId) {
    throw new Error('Staff member not found for this shop');
  }

  const patch: Record<string, unknown> = {};
  const nextPref: RrspShopStaffPreferences = { ...pref };

  if (updates.firstName !== undefined) patch.firstName = String(updates.firstName).trim();
  if (updates.lastName !== undefined) patch.lastName = String(updates.lastName).trim();
  if (updates.isActive !== undefined) patch.isActive = Boolean(updates.isActive);
  if (updates.roleLabel !== undefined) {
    nextPref.roleLabel = String(updates.roleLabel).trim() || 'Staff';
  }
  if (updates.modules !== undefined) {
    const modules = filterStaffModules(licensedModules, updates.modules);
    if (!modules.length) throw new Error('Select at least one RRSP page');
    nextPref.modules = modules;
  }
  if (updates.localUsername !== undefined) {
    const local = normalizeRrspShopStaffLocalUsername(updates.localUsername);
    if (!local) throw new Error('Enter a valid username');
    const username = buildRrspShopStaffUsername(local, settings.shopLoginSlug);
    if (username !== user.username) {
      const clash = await User.findOne({ where: { username } });
      if (clash && clash.id !== user.id) throw new Error('That staff username is already in use');
      patch.username = username;
    }
  }
  if (updates.password?.trim()) {
    patch.password = updates.password.trim();
    patch.passwordSet = true;
    patch.tempPassword = null;
    patch.isLocked = false;
    patch.failedLoginAttempts = 0;
    patch.lockoutUntil = null;
  }

  patch.preferences = {
    ...(user.preferences && typeof user.preferences === 'object' ? user.preferences : {}),
    rrspShopStaff: nextPref,
  };

  await user.update(patch);
  await user.reload({
    attributes: [
      'id',
      'username',
      'email',
      'firstName',
      'lastName',
      'isActive',
      'passwordSet',
      'preferences',
    ],
  });

  const refreshedPref = parseRrspShopStaffPreferences(user.preferences);
  return {
    id: user.id,
    username: user.username,
    localUsername: parseLocalUsernameFromStaffUser(user.username, settings.shopLoginSlug),
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    roleLabel: refreshedPref?.roleLabel ?? 'Staff',
    modules: refreshedPref?.modules ?? [],
    isActive: user.isActive,
    passwordSet: user.passwordSet,
  };
}

export async function deleteRrspShopStaffMember(mspClientId: string, staffUserId: number): Promise<void> {
  const user = await User.findByPk(staffUserId);
  if (!user) throw new Error('Staff member not found');
  const pref = parseRrspShopStaffPreferences(user.preferences);
  if (!pref || pref.mspClientId !== mspClientId) {
    throw new Error('Staff member not found for this shop');
  }
  await user.destroy();
}

export function getPortalDisplayRole(input: {
  role: string;
  isShopOwner?: boolean;
  isShopStaff?: boolean;
  staffRoleLabel?: string | null;
  securityClearance?: string;
}): string {
  if (input.isShopStaff && input.staffRoleLabel) return input.staffRoleLabel;
  if (input.isShopOwner && input.role === 'client') return 'admin';
  return input.role;
}

export function shouldShowSecurityClearance(input: {
  role: string;
  isShopOwner?: boolean;
  isShopStaff?: boolean;
}): boolean {
  if (input.isShopStaff || (input.isShopOwner && input.role === 'client')) return false;
  return input.role === 'admin' || input.role === 'technician';
}
