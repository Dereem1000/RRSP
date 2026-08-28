import { Client } from '@cd-v2/database';
import { normalizeServicePlanData } from '@/lib/rrsp';
import { normalizeStoredPhone } from '@/lib/phone-utils';
import {
  emptyRrspEmailSettings,
  isCustomRrspLogo,
  parseRrspBranding,
  parseRrspEmailSettings,
  RRSP_DEFAULT_LOGO,
  type RrspBranding,
  type RrspEmailSettings,
  type RrspPortalBranding,
} from '@/lib/rrsp-branding-shared';

export {
  emptyRrspBranding,
  emptyRrspEmailSettings,
  describeRrspEmailGaps,
  isCustomRrspLogo,
  maskRrspEmailSettings,
  mergeRrspEmailSettings,
  parseRrspBranding,
  parseRrspEmailSettings,
  RRSP_DEFAULT_LOGO,
  rrspEmailIsReady,
  type RrspBranding,
  type RrspEmailSettings,
  type RrspPortalBranding,
} from '@/lib/rrsp-branding-shared';

async function loadClientPlan(mspClientId: string) {
  const client = await Client.findByPk(mspClientId, {
    attributes: ['id', 'name', 'companyName', 'email', 'phone', 'address', 'servicePlanData'],
  });
  if (!client) return null;
  return {
    client,
    plan: normalizeServicePlanData(client.servicePlanData),
  };
}

export async function getRrspBrandingForClient(mspClientId: string): Promise<RrspBranding | null> {
  const loaded = await loadClientPlan(mspClientId);
  if (!loaded) return null;
  return parseRrspBranding(loaded.plan, loaded.client);
}

export async function getRrspEmailSettingsForClient(
  mspClientId: string
): Promise<RrspEmailSettings | null> {
  const loaded = await loadClientPlan(mspClientId);
  if (!loaded) return null;
  return parseRrspEmailSettings(loaded.plan);
}

export async function getRrspPortalBranding(mspClientId: string): Promise<RrspPortalBranding> {
  const branding = await getRrspBrandingForClient(mspClientId);
  if (!branding) {
    return { logoUrl: null, hasCustomLogo: false, companyName: '' };
  }
  const hasCustomLogo = isCustomRrspLogo(branding.companyLogo);
  return {
    logoUrl: hasCustomLogo ? branding.companyLogo : null,
    hasCustomLogo,
    companyName: branding.companyName,
  };
}

export async function saveRrspBrandingForClient(
  mspClientId: string,
  updates: Partial<RrspBranding>
): Promise<RrspBranding> {
  const loaded = await loadClientPlan(mspClientId);
  if (!loaded) throw new Error('Client not found');

  const current = parseRrspBranding(loaded.plan, loaded.client);
  const next: RrspBranding = {
    companyName: updates.companyName !== undefined ? String(updates.companyName).trim() : current.companyName,
    companyAddress:
      updates.companyAddress !== undefined
        ? String(updates.companyAddress).trim()
        : current.companyAddress,
    companyPhone:
      updates.companyPhone !== undefined
        ? normalizeStoredPhone(String(updates.companyPhone)) ?? ''
        : current.companyPhone,
    companyWebsite:
      updates.companyWebsite !== undefined
        ? String(updates.companyWebsite).trim()
        : current.companyWebsite,
    companyLogo:
      updates.companyLogo !== undefined
        ? String(updates.companyLogo).trim() || RRSP_DEFAULT_LOGO
        : current.companyLogo,
  };

  if (next.companyLogo.startsWith('data:') && next.companyLogo.length > 700_000) {
    throw new Error('Logo must be 512 KB or smaller');
  }

  const plan = {
    ...loaded.plan,
    rrspBranding: next,
  };

  const clientUpdates: Record<string, unknown> = { servicePlanData: plan };
  if (next.companyName) {
    clientUpdates.companyName = next.companyName.slice(0, 100);
    // Keep display name in sync when blank company was previously copied from name.
    if (!loaded.client.companyName || loaded.client.name === loaded.client.companyName) {
      clientUpdates.name = next.companyName.slice(0, 100);
    }
  }
  if (next.companyAddress) clientUpdates.address = next.companyAddress;
  if (next.companyPhone) clientUpdates.phone = next.companyPhone;

  await loaded.client.update(clientUpdates);
  return next;
}

export async function saveRrspEmailSettingsForClient(
  mspClientId: string,
  updates: Partial<RrspEmailSettings>
): Promise<RrspEmailSettings> {
  const loaded = await loadClientPlan(mspClientId);
  if (!loaded) throw new Error('Client not found');

  const current = parseRrspEmailSettings(loaded.plan);
  const passwordRaw = updates.password !== undefined ? String(updates.password) : undefined;
  const password =
    passwordRaw === undefined || passwordRaw === '' || passwordRaw === '********'
      ? current.password
      : passwordRaw;

  const next: RrspEmailSettings = emptyRrspEmailSettings({
    enabled: updates.enabled !== undefined ? Boolean(updates.enabled) : current.enabled,
    host: updates.host !== undefined ? String(updates.host).trim() : current.host,
    port: updates.port !== undefined ? Number(updates.port) || 587 : current.port,
    secure: updates.secure !== undefined ? Boolean(updates.secure) : current.secure,
    user: updates.user !== undefined ? String(updates.user).trim() : current.user,
    password,
    fromName: updates.fromName !== undefined ? String(updates.fromName).trim() : current.fromName,
    fromEmail:
      updates.fromEmail !== undefined ? String(updates.fromEmail).trim() : current.fromEmail,
  });

  await loaded.client.update({
    servicePlanData: {
      ...loaded.plan,
      rrspEmail: next,
    },
  });

  // Sequelize can miss JSON dirty-checks; force a fresh read after write.
  await loaded.client.reload({ attributes: ['servicePlanData'] });
  return parseRrspEmailSettings(loaded.client.servicePlanData);
}
