import { getEmailBrand, escapeHtml, infoRow, infoTable, paragraph, primaryButton, renderEmailLayout, statusBadge } from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';
import { buildPortalUrl } from '@/lib/site-url';
import { buildInvoicePublicPrintUrl } from '@/lib/view-tokens';

export type InvoiceEmailType = 'created' | 'reminder' | 'overdue' | 'paid' | 'partial' | 'updated';

export type InvoiceEmailPayload = {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount?: number;
  currency: string;
  status: string;
  dueDate?: string;
  billingCycle?: string | null;
  paymentGateway?: string | null;
  description?: string | null;
  items?: unknown[];
  client?: { name?: string; email?: string };
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function actionText(type: InvoiceEmailType, currency: string, paymentAmount?: number) {
  switch (type) {
    case 'created':
      return 'A new invoice has been generated for your account.';
    case 'reminder':
      return 'This is a friendly reminder about your outstanding invoice.';
    case 'overdue':
      return 'Your invoice is now overdue. Please make payment as soon as possible.';
    case 'paid':
      return 'Thank you! Your payment has been received.';
    case 'partial':
      return paymentAmount
        ? `Thank you! We have received your partial payment of ${formatMoney(paymentAmount, currency)}.`
        : 'Thank you! We have received your partial payment.';
    case 'updated':
      return 'Your invoice has been updated.';
  }
}

function statusColor(type: InvoiceEmailType) {
  switch (type) {
    case 'paid':
      return '#16a34a';
    case 'overdue':
      return '#dc2626';
    case 'partial':
      return '#0891b2';
    case 'reminder':
    case 'updated':
      return '#d97706';
    default:
      return '#4f46e5';
  }
}

export async function buildInvoiceEmailHtml(
  invoice: InvoiceEmailPayload,
  options?: { origin?: string; type?: InvoiceEmailType; paymentAmount?: number; test?: boolean }
) {
  const brand = await getEmailBrand();
  const resolvedCurrency = invoice.currency || 'TTD';
  const type = options?.type ?? 'created';
  const paid = Number(invoice.paidAmount ?? 0);
  const balance = Math.max(0, Number(invoice.amount) - paid);
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'Not set';
  const viewUrl = buildInvoicePublicPrintUrl(invoice.id, options?.origin);
  const portalUrl = (await buildPortalUrl(options?.origin)).replace(/\/login$/, '/billing');

  const rows = [
    infoRow('Invoice', `<a href="${escapeHtml(viewUrl)}" style="color:#4f46e5;font-weight:700;">#${escapeHtml(invoice.invoiceNumber)}</a>`),
    infoRow('Amount', `<strong>${escapeHtml(formatMoney(Number(invoice.amount), resolvedCurrency))}</strong>`),
    infoRow('Status', statusBadge(invoice.status, statusColor(type))),
    infoRow('Due date', escapeHtml(dueDate)),
  ];
  if (paid > 0) rows.push(infoRow('Paid', escapeHtml(formatMoney(paid, resolvedCurrency))));
  if (balance > 0 && invoice.status !== 'paid') {
    rows.push(infoRow('Balance due', `<strong style="color:#dc2626;">${escapeHtml(formatMoney(balance, resolvedCurrency))}</strong>`));
  }
  if (invoice.description) rows.push(infoRow('Description', escapeHtml(invoice.description)));

  const bodyHtml = [
    paragraph(escapeHtml(actionText(type, resolvedCurrency, options?.paymentAmount))),
    infoTable(rows.join('')),
    primaryButton('View & download invoice', viewUrl, 'No login required — link valid for 60 days'),
    paragraph(`You can also view this invoice in your <a href="${escapeHtml(portalUrl)}" style="color:#4f46e5;">client portal</a>.`),
  ].join('');

  const subjectMap: Record<InvoiceEmailType, string> = {
    created: `Invoice #${invoice.invoiceNumber} from ${brand.companyName}`,
    reminder: `Payment reminder — Invoice #${invoice.invoiceNumber}`,
    overdue: `Overdue invoice #${invoice.invoiceNumber}`,
    paid: `Payment received — Invoice #${invoice.invoiceNumber}`,
    partial: `Partial payment received — Invoice #${invoice.invoiceNumber}`,
    updated: `Invoice #${invoice.invoiceNumber} updated`,
  };

  const prefix = options?.test ? '[TEST] ' : '';
  const rendered = await renderEmailLayout({
    brand,
    origin: options?.origin,
    eyebrow: 'Billing',
    title: `Invoice #${invoice.invoiceNumber}`,
    preheader: actionText(type, resolvedCurrency, options?.paymentAmount),
    bodyHtml,
  });
  return {
    subject: `${prefix}${subjectMap[type]}`,
    ...rendered,
  };
}

export async function sendInvoiceToClient(
  invoice: InvoiceEmailPayload,
  clientEmail: string,
  options?: { origin?: string; type?: InvoiceEmailType; paymentAmount?: number }
) {
  const { subject, html, attachments } = await buildInvoiceEmailHtml(invoice, options);
  return sendEmail({ to: clientEmail, subject, html, attachments });
}
