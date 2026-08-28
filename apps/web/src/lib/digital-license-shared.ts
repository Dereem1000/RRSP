import type { ActivationFeature } from '@/lib/license-constants';

/**
 * Digital license certificate — proof-of-grant record for the client portal.
 *
 * Client-safe module (no database imports). Server builders live in digital-license.ts.
 */
export type DigitalLicenseCertificate = {
  certificateId: string;
  certificateTitle: string;
  licensorName: string;
  licensorContact: string;
  licenseeOrganization: string;
  licenseeContact: string;
  licenseeEmail?: string;
  licensedProduct: string;
  systemName: string;
  systemKey: string;
  systemVersion: string | null;
  feature: ActivationFeature;
  serialNumber: string | null;
  licenseType: string | null;
  licenseStatus: string;
  maxUsers: number | null;
  activationDate: string | null;
  expirationDate: string | null;
  projectReference: string;
  deliverableVersion: string | null;
  issuedAt: string;
  proprietaryNotice: string;
  grantOfLicense: string;
  scopeOfUse: string;
  ipOwnership: string;
  restrictions: string[];
  governingDocuments: string;
  updatesPolicy: string;
  termAndTermination: string;
  warrantyDisclaimer: string;
  limitationOfLiability: string;
  complianceNotice: string;
};

export function parseDeliverableMetaFromMarkdown(markdown: string): {
  documentVersion: string | null;
  systemVersion: string | null;
  systemName: string | null;
} {
  const documentVersion =
    markdown.match(/\*\*Document version:\*\*\s*([^\n*]+)/i)?.[1]?.trim() ?? null;
  const systemVersion =
    markdown.match(/\*\*System version at delivery record:\*\*\s*([^\n*]+)/i)?.[1]?.trim() ??
    null;
  const systemName =
    markdown.match(/\|\s*\*\*System name\*\*\s*\|\s*([^|\n]+)/i)?.[1]?.trim() ?? null;
  return { documentVersion, systemVersion, systemName };
}

function buildCertificateClauses(input: {
  systemName: string;
  systemVersion: string | null;
  projectReference: string;
  licenseType: string | null;
}): Pick<
  DigitalLicenseCertificate,
  | 'proprietaryNotice'
  | 'grantOfLicense'
  | 'scopeOfUse'
  | 'ipOwnership'
  | 'restrictions'
  | 'governingDocuments'
  | 'updatesPolicy'
  | 'termAndTermination'
  | 'warrantyDisclaimer'
  | 'limitationOfLiability'
  | 'complianceNotice'
> {
  const projectRef = input.projectReference || 'the published platform delivery record';
  const licenseTypeNote = input.licenseType ? ` (${input.licenseType})` : '';
  const versionNote = input.systemVersion
    ? ` at version ${input.systemVersion} as recorded in the platform delivery record`
    : ' at the version recorded in the platform delivery record';

  return {
    proprietaryNotice:
      'This software is proprietary to Computer Dynamics. It is licensed and owned by Computer Dynamics. ' +
      'It is NOT licensed under the MIT License or any other open-source license. ' +
      'This digital certificate records a limited grant of operating rights only; it does not transfer ownership ' +
      'of the software or any intellectual property.',
    grantOfLicense:
      `Computer Dynamics grants the Licensee named on this certificate a limited, non-exclusive, ` +
      `non-transferable, revocable license${licenseTypeNote} to install and operate the provisioned ` +
      `compiled runtime of ${input.systemName}${versionNote} on the Licensee's designated infrastructure.`,
    scopeOfUse:
      'Use is restricted to the Licensee\'s internal business operations within the delivered scope ' +
      `described in ${projectRef}. The licensed deliverable is the provisioned runtime package ` +
      '(compiled application and server runtime) accepted at delivery—not the development source tree, ' +
      'build pipeline, vendor repository, or every future product release. ' +
      'The runtime includes vendor-standard integrity and license-enforcement components; their design is confidential ' +
      'and this certificate does not disclose operational detail.',
    ipOwnership:
      'All copyrights, trade secrets, patents (where applicable), trademarks, and other intellectual property ' +
      'in the software, source code, architecture, schemas, documentation, and unreleased development assets ' +
      'remain the exclusive property of Computer Dynamics. This certificate grants no ownership interest. ' +
      'Licensee configurations, data, and uploaded content remain Licensee property; they do not grant ' +
      'Licensee any rights in the underlying software.',
    restrictions: [
      'No copying except as reasonably required for backup, disaster recovery, or operation on licensed installations.',
      'No distribution, rental, lease, sublicensing, assignment, or transfer of the software or activation credentials.',
      'No reverse engineering, decompiling, disassembly, or attempting to derive source code or underlying algorithms.',
      'No modification of the compiled software or creation of derivative works based on it.',
      'No removal, alteration, or obscuring of proprietary notices, branding, or license-validation components.',
      'No disabling, bypassing, probing, reverse engineering, or interference with vendor runtime integrity or license-enforcement controls embedded in the provisioned software.',
      'No use of the software to develop, market, or support a competing product or service.',
      'No access to the development repository, source tree, or internal build tooling except under separate written authorization from Computer Dynamics.',
    ],
    governingDocuments:
      `This certificate is issued with the platform delivery record${input.projectReference ? ` (reference: ${input.projectReference})` : ''}. ` +
      'The delivery record defines delivered scope, accepted delivery version, acceptance criteria, deferred items, ' +
      'updates policy (Section 4.7), and post-handover change control. ' +
      'If there is a conflict regarding delivered scope or updates, the signed platform delivery record and underlying agreement control.',
    updatesPolicy:
      'The licensed system may support remote update apply and provision update layout as delivered capability. ' +
      'That capability does not entitle the Licensee to ongoing updates after acceptance. ' +
      'Computer Dynamics may or may not publish or apply further updates for this installation unless separately agreed ' +
      '(maintenance agreement or separately agreed scope). Warranty covers defects in delivered scope only—not automatic ' +
      'access to new versions, modules, or enhancements built for other clients or the wider product line.',
    termAndTermination:
      'The license term is governed by the activation record shown on this certificate (license type, activation date, and expiration). ' +
      'Computer Dynamics may suspend or revoke serial activation for breach of these terms, license expiration, or non-compliance with the underlying agreement. ' +
      'Providing or withholding software updates does not by itself extend or renew the license term. ' +
      'On termination, the Licensee must cease use of the software except as reasonably required to export its own data.',
    warrantyDisclaimer:
      'Warranty and defect-remedy periods are as stated in the platform delivery record acceptance section and apply to ' +
      'defects in delivered scope during the warranty window only. They do not include post-handover feature updates, ' +
      'version upgrades, or new modules unless expressly agreed in writing. ' +
      'Except as expressly stated in the deliverable, the software is provided "as is" without additional warranties, ' +
      'express or implied, including merchantability or fitness for a particular purpose.',
    limitationOfLiability:
      'To the maximum extent permitted by applicable law, Computer Dynamics shall not be liable for indirect, incidental, special, ' +
      'consequential, or punitive damages arising from use of the software. Total liability is limited as set forth in the underlying agreement ' +
      'and platform delivery record financial terms.',
    complianceNotice:
      'License validity is enforced through Computer Dynamics serial-number registration, MSP license validation, ' +
      'and embedded runtime integrity controls supplied with the provisioned software. ' +
      'This certificate may be presented as evidence of licensed operation. Falsification, sharing of activation credentials, ' +
      'tampering with vendor runtime controls, or use outside the granted scope is prohibited and may result in immediate license revocation.',
  };
}

function clauseText(value: unknown, fallback: string): string {
  const text = value != null ? String(value).trim() : '';
  return text || fallback;
}

/** Fill missing or blank legal clauses (e.g. after schema upgrades on stored snapshots). */
export function enrichDigitalLicense(license: DigitalLicenseCertificate): DigitalLicenseCertificate {
  const clauses = buildCertificateClauses({
    systemName: license.systemName,
    systemVersion: license.systemVersion,
    projectReference: license.projectReference,
    licenseType: license.licenseType,
  });

  const restrictions =
    Array.isArray(license.restrictions) && license.restrictions.length > 0
      ? license.restrictions
      : clauses.restrictions;

  return {
    ...license,
    proprietaryNotice: clauseText(license.proprietaryNotice, clauses.proprietaryNotice),
    grantOfLicense: clauseText(license.grantOfLicense, clauses.grantOfLicense),
    scopeOfUse: clauseText(license.scopeOfUse, clauses.scopeOfUse),
    ipOwnership: clauseText(license.ipOwnership, clauses.ipOwnership),
    restrictions,
    governingDocuments: clauseText(license.governingDocuments, clauses.governingDocuments),
    updatesPolicy: clauseText(license.updatesPolicy, clauses.updatesPolicy),
    termAndTermination: clauseText(license.termAndTermination, clauses.termAndTermination),
    warrantyDisclaimer: clauseText(license.warrantyDisclaimer, clauses.warrantyDisclaimer),
    limitationOfLiability: clauseText(license.limitationOfLiability, clauses.limitationOfLiability),
    complianceNotice: clauseText(license.complianceNotice, clauses.complianceNotice),
  };
}

/** Rebuild or upgrade stored certificate snapshots (e.g. after schema changes). */
export function normalizeDigitalLicense(
  raw: unknown,
  fallback?: Partial<DigitalLicenseCertificate>,
): DigitalLicenseCertificate | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const feature = String(row.feature || fallback?.feature || 'pos') as ActivationFeature;
  const systemName = String(row.systemName || fallback?.systemName || row.productTitle || 'Licensed system');
  const projectReference = String(row.projectReference || fallback?.projectReference || '');
  const clauses = buildCertificateClauses({
    systemName,
    systemVersion:
      row.systemVersion != null
        ? String(row.systemVersion)
        : fallback?.systemVersion ?? null,
    projectReference,
    licenseType: row.licenseType != null ? String(row.licenseType) : null,
  });

  const legacyGrant = row.grantSummary != null ? String(row.grantSummary) : null;
  const legacyRestrictions =
    row.restrictionsSummary != null ? String(row.restrictionsSummary) : null;

  return enrichDigitalLicense({
    certificateId: String(row.certificateId || fallback?.certificateId || `CD-LIC-${feature}`),
    certificateTitle: String(row.certificateTitle || 'License to Operate — Digital Certificate'),
    licensorName: String(row.licensorName || row.vendorName || 'Computer Dynamics'),
    licensorContact: String(
      row.licensorContact || row.vendorContact || 'support@computerdynamicstt.com · +1 (868) 316-8851',
    ),
    licenseeOrganization: String(row.licenseeOrganization || fallback?.licenseeOrganization || ''),
    licenseeContact: String(row.licenseeContact || fallback?.licenseeContact || ''),
    licenseeEmail: row.licenseeEmail != null ? String(row.licenseeEmail) : fallback?.licenseeEmail,
    licensedProduct: String(row.licensedProduct || row.productTitle || fallback?.licensedProduct || ''),
    systemName,
    systemKey: String(row.systemKey || fallback?.systemKey || feature),
    systemVersion:
      row.systemVersion != null
        ? String(row.systemVersion)
        : fallback?.systemVersion ?? null,
    feature,
    serialNumber: row.serialNumber != null ? String(row.serialNumber) : null,
    licenseType: row.licenseType != null ? String(row.licenseType) : null,
    licenseStatus: String(row.licenseStatus || fallback?.licenseStatus || '—'),
    maxUsers:
      typeof row.maxUsers === 'number'
        ? row.maxUsers
        : fallback?.maxUsers ?? null,
    activationDate:
      row.activationDate != null ? String(row.activationDate) : fallback?.activationDate ?? null,
    expirationDate:
      row.expirationDate != null ? String(row.expirationDate) : fallback?.expirationDate ?? null,
    projectReference,
    deliverableVersion:
      row.deliverableVersion != null
        ? String(row.deliverableVersion)
        : row.documentVersion != null
          ? String(row.documentVersion)
          : fallback?.deliverableVersion ?? null,
    issuedAt: String(row.issuedAt || fallback?.issuedAt || new Date().toISOString()),
    proprietaryNotice: clauseText(row.proprietaryNotice, clauses.proprietaryNotice),
    grantOfLicense: clauseText(row.grantOfLicense || legacyGrant, clauses.grantOfLicense),
    scopeOfUse: clauseText(row.scopeOfUse, clauses.scopeOfUse),
    ipOwnership: clauseText(row.ipOwnership, clauses.ipOwnership),
    restrictions: Array.isArray(row.restrictions)
      ? row.restrictions.map(String).filter(Boolean)
      : legacyRestrictions
        ? [legacyRestrictions]
        : clauses.restrictions,
    governingDocuments: clauseText(row.governingDocuments, clauses.governingDocuments),
    updatesPolicy: clauseText(row.updatesPolicy, clauses.updatesPolicy),
    termAndTermination: clauseText(row.termAndTermination, clauses.termAndTermination),
    warrantyDisclaimer: clauseText(row.warrantyDisclaimer, clauses.warrantyDisclaimer),
    limitationOfLiability: clauseText(row.limitationOfLiability, clauses.limitationOfLiability),
    complianceNotice: clauseText(row.complianceNotice, clauses.complianceNotice),
  });
}

/** Hide full serial numbers unless the viewer has unlocked serials (staff or client password). */
export function redactDigitalLicense(
  license: DigitalLicenseCertificate,
  reveal: boolean,
): DigitalLicenseCertificate {
  if (reveal || !license.serialNumber?.trim()) return license;
  const masked = '••••-••••-••••';
  return {
    ...license,
    serialNumber: masked,
    certificateId: `CD-LIC-${masked}`,
  };
}
