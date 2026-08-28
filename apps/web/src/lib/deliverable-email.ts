import { Client } from '@/lib/db';
import {
  ACTIVATION_FEATURE_LABELS,
  getActivationFeatures,
  type ActivationFeature,
} from '@/lib/license-constants';
import type { DigitalLicenseCertificate } from '@/lib/digital-license-shared';
import {
  escapeHtml,
  getEmailBrand,
  highlightBox,
  infoRow,
  infoTable,
  paragraph,
  primaryButton,
  renderEmailLayout,
} from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';
import { parseDeliverableMetaFromMarkdown } from '@/lib/digital-license-shared';
import { buildPortalUrl } from '@/lib/site-url';

function extractTableField(markdown: string, fieldLabel: string): string | null {
  const re = new RegExp(`\\|\\s*\\*\\*${fieldLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\*\\*\\s*\\|\\s*([^|\\n]+)`, 'i');
  return markdown.match(re)?.[1]?.trim().replace(/`/g, '') ?? null;
}

function extractDocumentDate(markdown: string): string | null {
  return markdown.match(/\*\*Document date:\*\*\s*([^\n*]+)/i)?.[1]?.trim() ?? null;
}

function extractAgreedFee(markdown: string): string | null {
  const fromTable = extractTableField(markdown, 'Agreed project fee');
  if (fromTable) return fromTable.replace(/\*\*/g, '').trim();
  const match = markdown.match(/\*\*Agreed project fee\*\*\s*\|\s*\*\*`?([^`|*]+)`?\*\*/i);
  return match?.[1]?.trim() ?? null;
}

function extractExecutiveSummaryExcerpt(markdown: string, maxChars = 480): string {
  const sectionMatch = markdown.match(
    /##\s*3\.\s*Executive summary\s*([\s\S]*?)(?=\n##\s|\n---\s*\n##|$)/i,
  );
  if (!sectionMatch) return '';

  const paragraphs = sectionMatch[1]
    .split(/\n\n+/)
    .map((block) => block.trim())
    .filter(
      (block) =>
        block &&
        !block.startsWith('#') &&
        !block.startsWith('|') &&
        !block.startsWith('>') &&
        !block.startsWith('**Current release:**') &&
        !block.startsWith('**Updates:**') &&
        !block.startsWith('**Delivery snapshot:**') &&
        !block.startsWith('**Important:**'),
    )
    .map((block) =>
      block
        .replace(/\*\*/g, '')
        .replace(/`/g, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);

  let text = paragraphs.slice(0, 2).join(' ');
  if (!text) return '';
  if (text.length > maxChars) text = `${text.slice(0, maxChars - 1).trim()}…`;
  return text;
}

function formatEmailDate(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-TT', { year: 'numeric', month: 'long', day: 'numeric' });
}

function sectionHeading(title: string): string {
  return `<div style="margin:22px 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">${escapeHtml(title)}</div>`;
}

function maskedCertificateRef(license: DigitalLicenseCertificate): string {
  const serial = license.serialNumber?.trim();
  if (!serial) return license.certificateId;
  return `CD-LIC-••••-••••-••••`;
}

function buildDeliverableSummaryTable(input: {
  markdown: string;
  productTitle: string;
  sentAt: string;
}): string {
  const meta = parseDeliverableMetaFromMarkdown(input.markdown);
  const clientName = extractTableField(input.markdown, 'Client');
  const projectReference = extractTableField(input.markdown, 'Project reference');
  const agreedFee = extractAgreedFee(input.markdown);
  const documentDate = extractDocumentDate(input.markdown);

  const rows = [
    infoRow('System', escapeHtml(meta.systemName || input.productTitle)),
    meta.systemVersion
      ? infoRow('Delivery version', escapeHtml(meta.systemVersion))
      : '',
    meta.documentVersion
      ? infoRow('Document version', escapeHtml(meta.documentVersion))
      : '',
    clientName ? infoRow('Client', escapeHtml(clientName)) : '',
    projectReference ? infoRow('Project reference', escapeHtml(projectReference)) : '',
    agreedFee ? infoRow('Agreed project fee', escapeHtml(agreedFee)) : '',
    documentDate ? infoRow('Document date', escapeHtml(documentDate)) : '',
    infoRow('Published to portal', escapeHtml(formatEmailDate(input.sentAt))),
  ]
    .filter(Boolean)
    .join('');

  return infoTable(rows);
}

function buildDigitalLicenseSummaryTable(license: DigitalLicenseCertificate): string {
  const rows = [
    infoRow('Certificate', escapeHtml(license.certificateTitle)),
    infoRow('Licensed product', escapeHtml(license.licensedProduct)),
    infoRow('License status', escapeHtml(license.licenseStatus)),
    license.licenseType ? infoRow('License type', escapeHtml(license.licenseType)) : '',
    infoRow('Certificate reference', `<code style="font-family:Consolas,Monaco,monospace;font-size:13px;color:#0f172a;">${escapeHtml(maskedCertificateRef(license))}</code>`),
    license.activationDate
      ? infoRow('Activation date', escapeHtml(formatEmailDate(license.activationDate)))
      : '',
    license.expirationDate
      ? infoRow('Expiration date', escapeHtml(formatEmailDate(license.expirationDate)))
      : '',
    infoRow('Issued', escapeHtml(formatEmailDate(license.issuedAt))),
  ]
    .filter(Boolean)
    .join('');

  return infoTable(rows);
}

export async function sendClientDeliverableEmail(input: {
  clientId: string;
  feature: ActivationFeature;
  clientMarkdown: string;
  digitalLicense?: DigitalLicenseCertificate;
  sentAt?: string;
}) {
  const client = await Client.findByPk(input.clientId, {
    attributes: ['id', 'name', 'companyName', 'email', 'features'],
  });
  if (!client) throw new Error('Client not found');
  if (!client.email?.trim()) throw new Error('Client has no email address on file');

  const features = getActivationFeatures(client.features);
  if (!features.includes(input.feature)) {
    throw new Error('Client does not have this product enabled');
  }

  const label = ACTIVATION_FEATURE_LABELS[input.feature];
  const companyName = client.companyName || client.name;
  const sentAt = input.sentAt ?? new Date().toISOString();
  const portalUrl = (await buildPortalUrl()).replace(
    /\/login$/,
    `/deliverables?feature=${encodeURIComponent(input.feature)}`,
  );
  const brand = await getEmailBrand();
  const summaryExcerpt = extractExecutiveSummaryExcerpt(input.clientMarkdown);

  const bodyHtml = [
    paragraph(`Hello ${escapeHtml(companyName)},`),
    paragraph(
      `Your <strong>${escapeHtml(label.title)}</strong> platform delivery record and digital license certificate are now available in your client portal.`,
    ),
    sectionHeading('Delivery summary'),
    buildDeliverableSummaryTable({
      markdown: input.clientMarkdown,
      productTitle: label.title,
      sentAt,
    }),
    summaryExcerpt
      ? highlightBox(
          `<div style="font-size:14px;line-height:1.65;color:#334155;">${escapeHtml(summaryExcerpt)}</div>`,
        )
      : '',
    input.digitalLicense
      ? [
          sectionHeading('Digital license certificate'),
          buildDigitalLicenseSummaryTable(input.digitalLicense),
          paragraph(
            'The full certificate — including license terms, restrictions, and serial details — is available in your portal. Sign in with your portal password to view it.',
          ),
        ].join('')
      : '',
    primaryButton(
      'View in client portal',
      portalUrl,
      'Platform delivery record and digital license certificate',
    ),
    paragraph(
      'If you have questions about scope, acceptance, or licensing, reply to this email or contact our support team.',
    ),
  ].join('');

  const { html } = await renderEmailLayout({
    brand,
    eyebrow: 'Platform delivery',
    title: `Platform delivery — ${label.title}`,
    preheader: `Your ${label.title} platform delivery and digital license are ready to review.`,
    bodyHtml,
  });

  await sendEmail({
    to: client.email,
    subject: `Platform delivery — ${label.title}`,
    html,
    log: { category: 'other', detail: `deliverable:${client.id}:${input.feature}` },
  });
}
