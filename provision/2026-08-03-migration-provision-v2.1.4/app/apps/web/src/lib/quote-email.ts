import {
  escapeHtml,
  getEmailBrand,
  infoRow,
  infoTable,
  paragraph,
  primaryButton,
  renderEmailLayout,
} from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';
import { buildPortalUrl } from '@/lib/site-url';
import { getQuoteSettings } from '@/lib/quote-settings';
import { buildQuotePublicPrintUrl } from '@/lib/view-tokens';

export type QuoteEmailPayload = {
  id: string;
  quoteNumber: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  description?: string | null;
  validUntil?: string;
  terms?: string | null;
  notes?: string | null;
  items?: Array<{
    name?: string;
    description?: string;
    quantity?: number;
    price?: number;
    total?: number;
  }>;
  client?: { name?: string; email?: string };
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildItemsTable(items: QuoteEmailPayload['items'], currency: string) {
  if (!items?.length) return '';
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#334155;">${escapeHtml(item.name || 'Item')}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;color:#64748b;">${escapeHtml(item.description || '')}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${item.quantity ?? 1}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${escapeHtml(formatMoney(Number(item.price ?? 0), currency))}</td>
        <td style="padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;color:#334155;">${escapeHtml(formatMoney(Number(item.total ?? (item.quantity ?? 1) * (item.price ?? 0)), currency))}</td>
      </tr>`
    )
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:10px;text-align:left;font-size:12px;color:#64748b;">Item</th>
          <th style="padding:10px;text-align:left;font-size:12px;color:#64748b;">Description</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b;">Qty</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b;">Price</th>
          <th style="padding:10px;text-align:right;font-size:12px;color:#64748b;">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export async function buildQuoteEmailHtml(
  quote: QuoteEmailPayload,
  options?: { origin?: string; test?: boolean }
) {
  const [brand, quoteSettings] = await Promise.all([getEmailBrand(), getQuoteSettings()]);
  const currency = quote.currency || quoteSettings.currency || 'TTD';
  const validUntil = quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'Not set';
  const portalUrl = (await buildPortalUrl(options?.origin)).replace(/\/login$/, '/billing');
  const viewUrl = buildQuotePublicPrintUrl(quote.id, options?.origin);
  const terms = quote.terms || quoteSettings.paymentTerms;
  const warranty = quoteSettings.warrantyTerms;
  const closing = quoteSettings.closingMessage;
  const clientName = escapeHtml(quote.client?.name || 'Valued Client');

  const rows = [
    infoRow('Quote', `#${escapeHtml(quote.quoteNumber)}`),
    infoRow('Title', escapeHtml(quote.title)),
    infoRow('Amount', `<strong>${escapeHtml(formatMoney(Number(quote.amount), currency))}</strong>`),
    infoRow('Valid until', escapeHtml(validUntil)),
  ];
  if (quote.description) rows.push(infoRow('Description', escapeHtml(quote.description)));
  if (quote.notes) rows.push(infoRow('Notes', escapeHtml(quote.notes)));
  rows.push(infoRow('Payment terms', escapeHtml(terms)));
  if (warranty) rows.push(infoRow('Warranty terms', escapeHtml(warranty)));
  if (closing) rows.push(infoRow('Closing message', escapeHtml(closing)));

  const bodyHtml = [
    paragraph(`Dear ${clientName},`),
    paragraph('We have prepared a quote for your requested services. Please review the details below.'),
    infoTable(rows.join('')),
    buildItemsTable(quote.items, currency),
    primaryButton('View quote', viewUrl, 'No login required — link valid for 60 days'),
    paragraph(`You can accept or decline this quote in your <a href="${escapeHtml(portalUrl)}" style="color:#4f46e5;">client portal</a>.`),
  ].join('');

  const prefix = options?.test ? '[TEST] ' : '';
  const rendered = await renderEmailLayout({
    brand,
    origin: options?.origin,
    eyebrow: 'Quote',
    title: `Quote #${quote.quoteNumber}`,
    preheader: `${quote.title} — ${formatMoney(Number(quote.amount), currency)}`,
    bodyHtml,
  });
  return {
    subject: `${prefix}Quote #${quote.quoteNumber} from ${brand.companyName}`,
    ...rendered,
  };
}

export async function sendQuoteToClient(
  quote: QuoteEmailPayload,
  clientEmail: string,
  options?: { origin?: string; sentBy?: number }
) {
  const { subject, html, attachments } = await buildQuoteEmailHtml(quote, options);
  return sendEmail({
    to: clientEmail,
    subject,
    html,
    attachments,
    log: {
      category: 'quote',
      relatedType: 'quote',
      relatedId: quote.id,
      sentBy: options?.sentBy,
    },
  });
}
