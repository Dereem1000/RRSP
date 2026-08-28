import {
  ACTIVATION_FEATURE_LABELS,
  FEATURE_TO_LICENSE_KEY,
  type ActivationFeature,
} from '@/lib/license-constants';
import type { ClientLicenseSnapshot, LicenseRow } from '@/lib/license-service';
import { maskLicenseSerial } from '@/lib/license-serial-privacy';

export type PortalLicenseRow = {
  id: number;
  serialNumber: string;
  licenseType: string;
  isActive: boolean;
  maxUsers: number;
  expirationDate: string | null;
};

export type PortalSystemLicense = {
  feature: ActivationFeature;
  title: string;
  isActive: boolean;
  hasLicense: boolean;
  licenseType: string | null;
  maxUsers: number | null;
  expirationDate: string | null;
  /** Primary serial for this system (first active, else newest) */
  serialNumber: string | null;
  /** All license rows for this system (e.g. multiple registers) */
  licenses: PortalLicenseRow[];
};

export type ClientPortalLicensePayload = {
  source: 'license_system';
  revealed: boolean;
  hasLicense: boolean;
  isActive: boolean;
  licenseStatus: string;
  overallStatus: ClientLicenseSnapshot['overallStatus'];
  activationFeatures: ActivationFeature[];
  systems: PortalSystemLicense[];
  companyName: string | null;
  dbAvailable: boolean;
};

function licenseRowsForFeature(allLicenses: LicenseRow[], feature: ActivationFeature): LicenseRow[] {
  const key = FEATURE_TO_LICENSE_KEY[feature];
  return allLicenses
    .filter((row) => row.features[key])
    .sort((a, b) => b.id - a.id);
}

function toPortalRow(row: LicenseRow, reveal: boolean): PortalLicenseRow {
  return {
    id: row.id,
    serialNumber: reveal ? row.serialNumber : maskLicenseSerial(row.serialNumber) ?? '••••-••••-••••',
    licenseType: row.licenseType,
    isActive: row.isActive,
    maxUsers: row.maxUsers,
    expirationDate: row.expirationDate,
  };
}

export function buildClientPortalLicensePayload(
  snapshot: ClientLicenseSnapshot,
  companyName: string | null,
  reveal: boolean
): ClientPortalLicensePayload {
  const allLicenses = snapshot.license?.allLicenses ?? [];

  const systems: PortalSystemLicense[] = snapshot.activationFeatures.map((feature) => {
    const rows = licenseRowsForFeature(allLicenses, feature);
    const portalRows = rows.map((row) => toPortalRow(row, reveal));
    const status = snapshot.featureLicenseStatus[feature];
    const primary = portalRows.find((r) => r.isActive) ?? portalRows[0];

    return {
      feature,
      title: ACTIVATION_FEATURE_LABELS[feature].title,
      isActive: status?.isActive ?? false,
      hasLicense: status?.hasLicense ?? rows.length > 0,
      licenseType: primary?.licenseType ?? status?.licenseType ?? null,
      maxUsers: primary?.maxUsers ?? null,
      expirationDate: primary?.expirationDate ?? status?.expirationDate ?? null,
      serialNumber: primary?.serialNumber ?? (rows.length && !reveal ? maskLicenseSerial('hidden') : null),
      licenses: portalRows,
    };
  });

  const licenseStatus =
    snapshot.overallStatus === 'Partial' ? 'Partially active' : snapshot.overallStatus;

  return {
    source: 'license_system',
    revealed: reveal,
    hasLicense: snapshot.hasActiveLicense,
    isActive: snapshot.overallStatus === 'Active',
    licenseStatus,
    overallStatus: snapshot.overallStatus,
    activationFeatures: snapshot.activationFeatures,
    systems,
    companyName,
    dbAvailable: snapshot.dbAvailable,
  };
}
