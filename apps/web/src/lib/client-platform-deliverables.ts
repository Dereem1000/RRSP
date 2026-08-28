import { getPortalClient } from '@/lib/client-portal-billing';
import { resolveClientActivationFeatures } from '@/lib/clients';
import type { ActivationFeature } from '@/lib/license-constants';

/** Web platform products (excludes RRSP shop). */
export const PLATFORM_DELIVERABLE_FEATURES = [
  'pos',
  'restaurant',
  'document',
  'ecommerce',
  'auto',
  'distribution',
  'medical',
  'crm',
] as const satisfies readonly ActivationFeature[];

export type PlatformDeliverableFeature = (typeof PLATFORM_DELIVERABLE_FEATURES)[number];

export async function getClientPlatformLicenseFeatures(
  userId: number,
): Promise<PlatformDeliverableFeature[]> {
  const client = await getPortalClient(userId);
  if (!client) return [];
  const features = await resolveClientActivationFeatures(client);
  return PLATFORM_DELIVERABLE_FEATURES.filter((feature) => features.includes(feature));
}

export async function clientHasPlatformLicenses(userId: number): Promise<boolean> {
  const features = await getClientPlatformLicenseFeatures(userId);
  return features.length > 0;
}
