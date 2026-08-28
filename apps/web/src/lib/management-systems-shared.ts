import type { ActivationFeature } from '@/lib/license-constants';

/** Client-safe types for Management Systems UI (no database imports). */

export type FeatureLicenseDisplayStatus =
  | 'Active'
  | 'Pending'
  | 'Expired'
  | 'Not synced'
  | 'Unavailable';

export type GateStatus = 'none' | 'running' | 'passed' | 'failed' | 'passed_with_warnings';
export type DeliverableStatus = 'none' | 'draft' | 'sent';

export type ManagementSystemClientRow = {
  clientId: string;
  clientName: string;
  serviceLevel: string | null;
  clientStatus: string | null;
  licenseStatus: FeatureLicenseDisplayStatus;
  serialNumber: string | null;
  licenseType: string | null;
  expirationDate: string | null;
  activationDate: string | null;
  provisionStatus?: GateStatus;
  installStatus?: GateStatus;
  deliverableStatus?: DeliverableStatus;
  provisionRunId?: string;
  installRunId?: string;
  provisionAt?: string;
  installAt?: string;
};

export type ManagementSystemOverview = {
  feature: ActivationFeature;
  title: string;
  description: string;
  productCode: string;
  totalClients: number;
  activated: number;
  pending: number;
  expired: number;
  notSynced: number;
  clients: ManagementSystemClientRow[];
};

export type ManagementSystemsOverviewData = {
  dbAvailable: boolean;
  dbPath?: string;
  systems: ManagementSystemOverview[];
  totals: {
    systems: number;
    clientsWithAnySystem: number;
    activatedLicenses: number;
    pendingLicenses: number;
    expiredLicenses: number;
  };
};

export type ClientSystemActivation = {
  feature: ActivationFeature;
  title: string;
  productCode: string;
  licenseStatus: FeatureLicenseDisplayStatus;
  serialNumber: string | null;
  licenseType: string | null;
  expirationDate: string | null;
  provisionStatus?: GateStatus;
  installStatus?: GateStatus;
  deliverableStatus?: DeliverableStatus;
  provisionRunId?: string;
  installRunId?: string;
  provisionAt?: string;
  installAt?: string;
};

export type GroupedManagementClient = {
  clientId: string;
  clientName: string;
  serviceLevel: string | null;
  clientStatus: string | null;
  systems: ClientSystemActivation[];
};

export function buildGroupedManagementClients(
  systems: ManagementSystemOverview[],
): GroupedManagementClient[] {
  const map = new Map<string, GroupedManagementClient>();

  for (const system of systems) {
    for (const row of system.clients) {
      let group = map.get(row.clientId);
      if (!group) {
        group = {
          clientId: row.clientId,
          clientName: row.clientName,
          serviceLevel: row.serviceLevel,
          clientStatus: row.clientStatus,
          systems: [],
        };
        map.set(row.clientId, group);
      }
      group.systems.push({
        feature: system.feature,
        title: system.title,
        productCode: system.productCode,
        licenseStatus: row.licenseStatus,
        serialNumber: row.serialNumber,
        licenseType: row.licenseType,
        expirationDate: row.expirationDate,
        provisionStatus: row.provisionStatus,
        installStatus: row.installStatus,
        deliverableStatus: row.deliverableStatus,
        provisionRunId: row.provisionRunId,
        installRunId: row.installRunId,
        provisionAt: row.provisionAt,
        installAt: row.installAt,
      });
    }
  }

  for (const group of map.values()) {
    group.systems.sort((a, b) => a.title.localeCompare(b.title));
  }

  return [...map.values()].sort((a, b) => a.clientName.localeCompare(b.clientName));
}
