import { Client } from '@/lib/db';
import {
  ACTIVATION_FEATURE_LABELS,
  FEATURE_TO_LICENSE_KEY,
  getActivationFeatures,
  type ActivationFeature,
} from '@/lib/license-constants';
import { escapeHtml, getEmailBrand, infoRow, infoTable, paragraph, renderEmailLayout } from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';
import { getClientLicenseSnapshot } from '@/lib/license-service';
import { verifyStaffPassword } from '@/lib/license-serial-access';

function licenseRowsForFeature(
  allLicenses: NonNullable<Awaited<ReturnType<typeof getClientLicenseSnapshot>>['license']>['allLicenses'],
  feature: ActivationFeature
) {
  const key = FEATURE_TO_LICENSE_KEY[feature];
  return allLicenses.filter((row) => row.features[key]).sort((a, b) => b.id - a.id);
}

export async function sendClientLicenseEmail(input: {
  clientId: string;
  password: string;
  staffUserId: number;
  origin?: string;
}) {
  const valid = await verifyStaffPassword(input.staffUserId, input.password);
  if (!valid) {
    throw new Error('Incorrect password');
  }

  const client = await Client.findByPk(input.clientId, {
    attributes: ['id', 'name', 'companyName', 'email', 'features'],
  });
  if (!client) throw new Error('Client not found');
  if (!client.email?.trim()) throw new Error('Client has no email address on file');

  const activationFeatures = getActivationFeatures(client.features);
  if (activationFeatures.length === 0) {
    throw new Error('No activation features configured for this client');
  }

  const snapshot = await getClientLicenseSnapshot(client.id);
  if (!snapshot.dbAvailable) {
    throw new Error('License database is not available');
  }

  const allLicenses = snapshot.license?.allLicenses ?? [];
  const companyName = client.companyName || client.name;

  const systemBlocks = activationFeatures.map((feature) => {
    const rows = licenseRowsForFeature(allLicenses, feature);
    const label = ACTIVATION_FEATURE_LABELS[feature];
    if (rows.length === 0) {
      return paragraph(
        `<strong>${escapeHtml(label.title)}</strong><br/>No license has been issued yet for this system.`
      );
    }
    const licenseRows = rows
      .map((row, index) =>
        infoTable(
          [
            infoRow('System', escapeHtml(label.title)),
            infoRow('License', rows.length > 1 ? `#${index + 1}` : 'Primary'),
            infoRow(
              'Serial number',
              `<code style="font-family:monospace;">${escapeHtml(row.serialNumber)}</code>`
            ),
            infoRow('Type', escapeHtml(row.licenseType || '—')),
            infoRow('Status', row.isActive ? 'Active' : 'Pending activation'),
            infoRow(
              'Expires',
              row.expirationDate ? escapeHtml(String(row.expirationDate).slice(0, 10)) : 'No expiry'
            ),
          ].join('')
        )
      )
      .join('');
    return licenseRows;
  });

  const brand = await getEmailBrand();
  const bodyHtml = [
    paragraph(`Hello ${escapeHtml(client.name)},`),
    paragraph(
      `Here are your Computer Dynamics license details for <strong>${escapeHtml(companyName)}</strong>. Keep these serial numbers secure — they are required to activate your management systems.`
    ),
    ...systemBlocks,
    paragraph(
      'If you need help activating a system, contact Computer Dynamics support or sign in to your client portal.'
    ),
  ].join('');

  const { html } = await renderEmailLayout({
    brand,
    eyebrow: 'Licenses',
    title: 'Your management system licenses',
    preheader: `License details for ${companyName}`,
    bodyHtml,
    origin: input.origin,
  });

  await sendEmail({
    to: client.email.trim(),
    subject: `Your license details — ${companyName}`,
    html,
    log: { category: 'other', detail: `client-licenses:${client.id}`, sentBy: input.staffUserId },
  });

  return {
    clientId: client.id,
    clientEmail: client.email.trim(),
    systemsEmailed: activationFeatures.length,
  };
}
