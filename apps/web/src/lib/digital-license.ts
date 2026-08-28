import { Client } from '@/lib/db';
import { ACTIVATION_FEATURE_LABELS, type ActivationFeature } from '@/lib/license-constants';
import { getProductConfig } from '@/lib/management-system-product-config';
import {
  featureLicenseDisplayStatus,
  getClientLicenseSnapshot,
} from '@/lib/license-service';
import {
  enrichDigitalLicense,
  parseDeliverableMetaFromMarkdown,
  type DigitalLicenseCertificate,
} from '@/lib/digital-license-shared';

export type { DigitalLicenseCertificate } from '@/lib/digital-license-shared';
export {
  enrichDigitalLicense,
  normalizeDigitalLicense,
  parseDeliverableMetaFromMarkdown,
  redactDigitalLicense,
} from '@/lib/digital-license-shared';

function placeholderVal(
  placeholders: Record<string, string>,
  key: string,
  fallback = '',
): string {
  return placeholders[key]?.trim() || fallback;
}

/** Build a digital license certificate from client/deliverable/license data (server only). */
export async function buildDigitalLicense(input: {
  clientId: string;
  feature: ActivationFeature;
  placeholders: Record<string, string>;
  staffMarkdown?: string;
  issuedAt?: string;
}): Promise<DigitalLicenseCertificate> {
  const client = await Client.findByPk(input.clientId, {
    attributes: ['id', 'name', 'companyName', 'email', 'contactPerson', 'phone'],
  });
  if (!client) throw new Error('Client not found');

  const product = await getProductConfig(input.feature);
  const label = ACTIVATION_FEATURE_LABELS[input.feature];
  const snapshot = await getClientLicenseSnapshot(input.clientId);
  const licenseEntry = snapshot.featureLicenseStatus[input.feature];
  const licenseStatus = featureLicenseDisplayStatus(licenseEntry, snapshot.dbAvailable);

  const meta = input.staffMarkdown
    ? parseDeliverableMetaFromMarkdown(input.staffMarkdown)
    : { documentVersion: null, systemVersion: null, systemName: null };

  const licenseeOrganization =
    placeholderVal(input.placeholders, '[Client / Organization Name]') ||
    client.companyName ||
    client.name ||
    '';
  const licenseeContact =
    placeholderVal(input.placeholders, '[Name, email, phone]') ||
    [client.contactPerson, client.email, client.phone].filter(Boolean).join(' · ');
  const projectReference = placeholderVal(input.placeholders, '[Project / Invoice Reference]');
  const systemName = meta.systemName || label.title;

  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const licenseRow = snapshot.license?.allLicenses?.find(
    (row) => row.serialNumber && row.serialNumber === licenseEntry?.serialNumber,
  );
  const serialNumber = licenseEntry?.serialNumber ?? null;

  return enrichDigitalLicense({
    certificateId: serialNumber
      ? `CD-LIC-${serialNumber}`
      : `CD-LIC-${input.feature}-${issuedAt.slice(0, 10)}`,
    certificateTitle: 'License to Operate — Digital Certificate',
    licensorName: 'Computer Dynamics',
    licensorContact: 'support@computerdynamicstt.com · +1 (868) 316-8851',
    licenseeOrganization,
    licenseeContact,
    licenseeEmail: client.email ?? undefined,
    licensedProduct: label.title,
    systemName,
    systemKey: product.systemKey || input.feature,
    systemVersion: meta.systemVersion,
    feature: input.feature,
    serialNumber,
    licenseType: licenseEntry?.licenseType ?? null,
    licenseStatus,
    maxUsers: licenseRow?.maxUsers ?? snapshot.license?.maxUsers ?? null,
    activationDate: licenseRow?.activationDate ?? snapshot.license?.activationDate ?? null,
    expirationDate: licenseEntry?.expirationDate ?? null,
    projectReference,
    deliverableVersion: meta.documentVersion,
    issuedAt,
    proprietaryNotice: '',
    grantOfLicense: '',
    scopeOfUse: '',
    ipOwnership: '',
    restrictions: [],
    governingDocuments: '',
    updatesPolicy: '',
    termAndTermination: '',
    warrantyDisclaimer: '',
    limitationOfLiability: '',
    complianceNotice: '',
  });
}
