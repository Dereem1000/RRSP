import { redirect } from 'next/navigation';
import { Client, User } from '@/lib/db';
import type { Client as ClientModel } from '@cd-v2/database';
import { getClientLicenseSnapshot } from '@/lib/license-service';
import { resolveClientActivationFeatures } from '@/lib/clients';
import {
  getRrspModules,
  normalizeServicePlanData,
  RRSP_HREF_TO_MODULE,
  RRSP_MODULE_HREF,
  type RrspModule,
} from '@/lib/rrsp';
import {
  getMissingRrspContactFields,
  isRrspContactComplete,
  type RrspContactField,
} from '@/lib/rrsp-contact';
import {
  filterStaffModules,
  getPortalDisplayRole,
  parseRrspShopStaffPreferences,
  parseRrspShopStaffSettings,
  type RrspShopStaffSettings,
} from '@/lib/rrsp-shop-staff';

export type ClientRrspAccess = {
  /** MSP client has the `rrsp` activation feature selected (or license-inferred). */
  featureEnabled: boolean;
  /** Feature selected, license active, and required contact details filled. */
  enabled: boolean;
  mspClientId: string | null;
  modules: RrspModule[];
  licenseActive: boolean;
  /** Address, email, and phone are all present on the MSP client record. */
  contactComplete: boolean;
  missingContactFields: RrspContactField[];
  /** RRSP license is usable except contact details are incomplete — prompt on login. */
  needsContact: boolean;
  /** Primary RRSP shop account (MSP client portal user). */
  isShopOwner?: boolean;
  /** Shop staff sub-account — RRSP pages only. */
  isShopStaff?: boolean;
  staffRoleLabel?: string | null;
  portalDisplayRole?: string;
  staffSettings?: RrspShopStaffSettings | null;
  /** Shop staff login slug (`user@slug`) — for branded logout/login URLs. */
  shopLoginSlug?: string | null;
};

function emptyAccess(overrides?: Partial<ClientRrspAccess>): ClientRrspAccess {
  return {
    featureEnabled: false,
    enabled: false,
    mspClientId: null,
    modules: [],
    licenseActive: false,
    contactComplete: false,
    missingContactFields: [],
    needsContact: false,
    ...overrides,
  };
}

async function buildMspClientRrspAccess(
  client: {
    id: string;
    features: unknown;
    servicePlanData: unknown;
    name: string;
    companyName?: string | null;
    email: string;
    phone?: string | null;
    address?: string | null;
    update: (values: Record<string, unknown>) => Promise<unknown>;
  },
  options?: {
    isShopOwner?: boolean;
    isShopStaff?: boolean;
    staffRoleLabel?: string | null;
    staffModules?: RrspModule[];
    staffSettings?: RrspShopStaffSettings | null;
  }
): Promise<ClientRrspAccess> {

  const missingContactFields = getMissingRrspContactFields({
    email: client.email,
    phone: client.phone,
    address: client.address,
  });
  const contactComplete = isRrspContactComplete({
    email: client.email,
    phone: client.phone,
    address: client.address,
  });

  // Persist license-inferred features (e.g. RRSP license → `rrsp` on MSP client).
  const resolvedFeatures = await resolveClientActivationFeatures(client as ClientModel);
  const storedFeatures = Array.isArray(client.features) ? client.features : [];
  if (JSON.stringify(resolvedFeatures) !== JSON.stringify(storedFeatures)) {
    await client.update({ features: resolvedFeatures });
  }

  const featureEnabled = resolvedFeatures.includes('rrsp');
  const plan = normalizeServicePlanData(client.servicePlanData);
  // Heal corrupted service_plan_data so module toggles can be saved later.
  if (JSON.stringify(plan) !== JSON.stringify(client.servicePlanData ?? {})) {
    await client.update({ servicePlanData: plan });
  }

  const licensedModules = Object.entries(getRrspModules(plan))
    .filter(([, on]) => on)
    .map(([key]) => key as RrspModule);

  const modules =
    options?.isShopStaff && options.staffModules
      ? filterStaffModules(licensedModules, options.staffModules)
      : licensedModules;

  const portalDisplayRole = getPortalDisplayRole({
    role: 'client',
    isShopOwner: options?.isShopOwner,
    isShopStaff: options?.isShopStaff,
    staffRoleLabel: options?.staffRoleLabel,
  });
  const shopLoginSlug = options?.staffSettings?.shopLoginSlug ?? null;

  if (!featureEnabled) {
    return emptyAccess({
      featureEnabled: false,
      mspClientId: client.id,
      contactComplete,
      missingContactFields,
      isShopOwner: options?.isShopOwner,
      isShopStaff: options?.isShopStaff,
      staffRoleLabel: options?.staffRoleLabel,
      portalDisplayRole,
      staffSettings: options?.staffSettings ?? null,
      shopLoginSlug,
    });
  }

  const snapshot = await getClientLicenseSnapshot(client.id);
  const rrspStatus = snapshot.featureLicenseStatus.rrsp;
  const licenseActive = Boolean(rrspStatus?.hasLicense && rrspStatus?.isActive);

  if (!licenseActive) {
    return emptyAccess({
      featureEnabled: true,
      mspClientId: client.id,
      modules,
      licenseActive: false,
      contactComplete,
      missingContactFields,
      isShopOwner: options?.isShopOwner,
      isShopStaff: options?.isShopStaff,
      staffRoleLabel: options?.staffRoleLabel,
      portalDisplayRole,
      staffSettings: options?.staffSettings ?? null,
      shopLoginSlug,
    });
  }

  const needsContact = !contactComplete && !options?.isShopStaff;

  return {
    featureEnabled: true,
    // Incomplete contact blocks RRSP features until filled (shop owner only).
    enabled: options?.isShopStaff ? modules.length > 0 : contactComplete,
    mspClientId: client.id,
    modules,
    licenseActive: true,
    contactComplete,
    missingContactFields,
    needsContact,
    isShopOwner: options?.isShopOwner,
    isShopStaff: options?.isShopStaff,
    staffRoleLabel: options?.staffRoleLabel,
    portalDisplayRole,
    staffSettings: options?.staffSettings ?? null,
    shopLoginSlug,
  };
}

export async function getClientRrspAccess(userId: number): Promise<ClientRrspAccess> {
  const user = await User.findByPk(userId, { attributes: ['id', 'role', 'preferences'] });
  const staffPref = user ? parseRrspShopStaffPreferences(user.preferences) : null;

  if (staffPref) {
    const client = await Client.findByPk(staffPref.mspClientId, {
      attributes: [
        'id',
        'features',
        'servicePlanData',
        'name',
        'companyName',
        'email',
        'phone',
        'address',
      ],
    });
    if (!client) return emptyAccess();
    const staffSettings = parseRrspShopStaffSettings(client.servicePlanData, client);
    return buildMspClientRrspAccess(client, {
      isShopStaff: true,
      staffRoleLabel: staffPref.roleLabel,
      staffModules: staffPref.modules,
      staffSettings,
    });
  }

  const client = await Client.findOne({
    where: { userId },
    attributes: ['id', 'features', 'servicePlanData', 'name', 'companyName', 'email', 'phone', 'address'],
  });
  if (!client) {
    return emptyAccess();
  }

  const staffSettings = parseRrspShopStaffSettings(client.servicePlanData, client);
  return buildMspClientRrspAccess(client, {
    isShopOwner: true,
    staffSettings,
  });
}

export async function clientHasRrspModule(userId: number, module: RrspModule): Promise<boolean> {
  const access = await getClientRrspAccess(userId);
  return access.enabled && access.modules.includes(module);
}

/** CD staff redirect away. Shop owner/staff need RRSP license + module access. */
export async function requireRrspModule(
  user: { id: number; role: string },
  module: RrspModule
): Promise<{ mspClientId: string | null; rrsp: boolean }> {
  if (user.role !== 'client') {
    redirect('/dashboard');
  }

  const access = await getClientRrspAccess(user.id);
  if (!access.enabled || !access.mspClientId || !access.modules.includes(module)) {
    redirect(access.isShopStaff ? firstRrspModuleHref(access.modules) : '/dashboard');
  }

  return { mspClientId: access.mspClientId, rrsp: true };
}

export function firstRrspModuleHref(modules: RrspModule[]): string {
  if (modules.length > 0) return '/rrsp';
  return '/rrsp/tickets';
}

export function rrspModuleForPathname(pathname: string | null): RrspModule | null {
  if (!pathname) return null;
  if (!pathname.startsWith('/rrsp/')) return null;
  const base = '/' + pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  return RRSP_HREF_TO_MODULE[base] ?? null;
}
