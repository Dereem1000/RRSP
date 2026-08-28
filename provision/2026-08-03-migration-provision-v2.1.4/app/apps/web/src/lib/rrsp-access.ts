import { redirect } from 'next/navigation';
import { Client } from '@/lib/db';
import { getClientLicenseSnapshot } from '@/lib/license-service';
import { resolveClientActivationFeatures } from '@/lib/clients';
import {
  getRrspModules,
  normalizeServicePlanData,
  RRSP_HREF_TO_MODULE,
  type RrspModule,
} from '@/lib/rrsp';
import {
  getMissingRrspContactFields,
  isRrspContactComplete,
  type RrspContactField,
} from '@/lib/rrsp-contact';

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

export async function getClientRrspAccess(userId: number): Promise<ClientRrspAccess> {
  const client = await Client.findOne({
    where: { userId },
    attributes: ['id', 'features', 'servicePlanData', 'name', 'companyName', 'email', 'phone', 'address'],
  });
  if (!client) {
    return emptyAccess();
  }

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
  const resolvedFeatures = await resolveClientActivationFeatures(client);
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

  const modules = Object.entries(getRrspModules(plan))
    .filter(([, on]) => on)
    .map(([key]) => key as RrspModule);

  if (!featureEnabled) {
    return emptyAccess({
      featureEnabled: false,
      mspClientId: client.id,
      contactComplete,
      missingContactFields,
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
    });
  }

  const needsContact = !contactComplete;

  return {
    featureEnabled: true,
    // Incomplete contact blocks RRSP features until filled.
    enabled: contactComplete,
    mspClientId: client.id,
    modules,
    licenseActive: true,
    contactComplete,
    missingContactFields,
    needsContact,
  };
}

export async function clientHasRrspModule(userId: number, module: RrspModule): Promise<boolean> {
  const access = await getClientRrspAccess(userId);
  return access.enabled && access.modules.includes(module);
}

/** Staff always pass. Client users need RRSP license + module toggle (RRSP routes only). */
export async function requireRrspModule(
  user: { id: number; role: string },
  module: RrspModule
): Promise<{ mspClientId: string | null; rrsp: boolean }> {
  if (user.role !== 'client') {
    // Staff do not use /rrsp/* shop DBs in this phase.
    redirect('/dashboard');
  }

  const access = await getClientRrspAccess(user.id);
  if (!access.enabled || !access.mspClientId || !access.modules.includes(module)) {
    redirect('/dashboard');
  }

  return { mspClientId: access.mspClientId, rrsp: true };
}

export function rrspModuleForPathname(pathname: string | null): RrspModule | null {
  if (!pathname) return null;
  if (!pathname.startsWith('/rrsp/')) return null;
  const base = '/' + pathname.split('/').filter(Boolean).slice(0, 2).join('/');
  return RRSP_HREF_TO_MODULE[base] ?? null;
}
