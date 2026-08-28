import { Client } from '@cd-v2/database';
import { activationFeaturesWhereOptions } from '@/lib/activation-features-query';
import {
  ACTIVATION_FEATURES,
  ACTIVATION_FEATURE_LABELS,
  getActivationFeatures,
} from '@/lib/license-constants';
import { featureCodeForMspFeature } from '@/lib/license-serial';
import {
  buildLicenseSnapshot,
  featureLicenseDisplayStatus,
  getLicenseStatusByMspClientId,
  isLicenseDbAvailable,
  getLicenseDbPathForDisplay,
} from '@/lib/license-service';
import type {
  ManagementSystemClientRow,
  ManagementSystemOverview,
  ManagementSystemsOverviewData,
} from '@/lib/management-systems-shared';
import { redactManagementSystemsOverview } from '@/lib/license-serial-privacy';

export type {
  ClientSystemActivation,
  FeatureLicenseDisplayStatus,
  GroupedManagementClient,
  ManagementSystemClientRow,
  ManagementSystemOverview,
  ManagementSystemsOverviewData,
} from '@/lib/management-systems-shared';

export { buildGroupedManagementClients } from '@/lib/management-systems-shared';

export async function getManagementSystemsOverview(
  options?: { revealSerials?: boolean }
): Promise<ManagementSystemsOverviewData> {
  const dbAvailable = isLicenseDbAvailable();
  const dbPath = dbAvailable ? getLicenseDbPathForDisplay() : undefined;

  const clients = await Client.findAll({
    where: activationFeaturesWhereOptions(),
    attributes: ['id', 'name', 'companyName', 'serviceLevel', 'features', 'status'],
    order: [['companyName', 'ASC'], ['name', 'ASC']],
  });

  const licenseCache = new Map<string, Awaited<ReturnType<typeof getLicenseStatusByMspClientId>>>();

  async function licenseForClient(clientId: string) {
    if (!dbAvailable) return null;
    if (!licenseCache.has(clientId)) {
      try {
        licenseCache.set(clientId, await getLicenseStatusByMspClientId(clientId));
      } catch {
        licenseCache.set(clientId, null);
      }
    }
    return licenseCache.get(clientId) ?? null;
  }

  const systems: ManagementSystemOverview[] = [];
  let activatedLicenses = 0;
  let pendingLicenses = 0;
  let expiredLicenses = 0;

  for (const feature of ACTIVATION_FEATURES) {
    const label = ACTIVATION_FEATURE_LABELS[feature];
    const featureClients = clients.filter((c) => getActivationFeatures(c.features).includes(feature));

    const rows: ManagementSystemClientRow[] = [];
    let activated = 0;
    let pending = 0;
    let expired = 0;
    let notSynced = 0;

    for (const client of featureClients) {
      const activationFeatures = getActivationFeatures(client.features);
      const license = await licenseForClient(client.id);
      const snapshot = buildLicenseSnapshot(license, activationFeatures);
      const entry = snapshot.featureLicenseStatus[feature];
      const licenseStatus = featureLicenseDisplayStatus(entry, dbAvailable);

      if (licenseStatus === 'Active') activated++;
      else if (licenseStatus === 'Pending') pending++;
      else if (licenseStatus === 'Expired') expired++;
      else notSynced++;

      rows.push({
        clientId: client.id,
        clientName: client.companyName || client.name,
        serviceLevel: client.serviceLevel ?? null,
        clientStatus: client.status ?? null,
        licenseStatus,
        serialNumber: entry?.serialNumber ?? null,
        licenseType: entry?.licenseType ?? null,
        expirationDate: entry?.expirationDate ?? null,
        activationDate: license?.activationDate ?? null,
      });
    }

    activatedLicenses += activated;
    pendingLicenses += pending;
    expiredLicenses += expired;

    systems.push({
      feature,
      title: label.title,
      description: label.description,
      productCode: featureCodeForMspFeature(feature),
      totalClients: featureClients.length,
      activated,
      pending,
      expired,
      notSynced,
      clients: rows,
    });
  }

  const overview = {
    dbAvailable,
    dbPath,
    systems,
    totals: {
      systems: ACTIVATION_FEATURES.length,
      clientsWithAnySystem: clients.length,
      activatedLicenses,
      pendingLicenses,
      expiredLicenses,
    },
  };

  return redactManagementSystemsOverview(overview, options?.revealSerials === true);
}
