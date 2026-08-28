import { getQuoteSettings } from '@/lib/quote-settings';
import { parseItems } from '@/lib/accounting';

type InvoiceDoc = {
  invoiceNumber: string;
  amount: number;
  paidAmount?: number;
  currency: string;
  status: string;
  dueDate: string;
  paidDate?: string | null;
  description?: string | null;
  items?: unknown[];
  client?: { name?: string; email?: string };
};

type QuoteDoc = {
  quoteNumber: string;
  title: string;
  amount: number;
  currency: string;
  status: string;
  validUntil: string;
  description?: string | null;
  terms?: string | null;
  notes?: string | null;
  items?: unknown[];
  client?: { name?: string; email?: string };
};

function formatMoney(amount: number, currency: string) {
  return `${currency} ${Number(amount).toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function itemsTable(items: unknown[], currency: string) {
  const rows = parseItems(JSON.stringify(items));
  if (!rows.length) return '';
  const lines = rows
    .map((raw) => {
      const item = raw as { name?: string; description?: string; quantity?: number; price?: number; total?: number };
      const qty = Number(item.quantity ?? 1);
      const price = Number(item.price ?? 0);
      const total = Number(item.total ?? qty * price);
      return `<tr>
        <td>${item.name ?? 'Item'}</td>
        <td>${item.description ?? ''}</td>
        <td style="text-align:right">${qty}</td>
        <td style="text-align:right">${formatMoney(price, currency)}</td>
        <td style="text-align:right">${formatMoney(total, currency)}</td>
      </tr>`;
    })
    .join('');
  return `<table>
    <thead><tr><th>Item</th><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>${lines}</tbody>
  </table>`;
}

function documentShell(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #1e293b; margin: 0; padding: 24px; background: #f8fafc; }
    .page { max-width: 820px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 32px; }
    .header { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 16px; }
    .brand h1 { margin: 0; font-size: 24px; color: #2563eb; }
    .brand p { margin: 4px 0 0; color: #64748b; font-size: 13px; }
    .meta { text-align: right; font-size: 14px; }
    .meta strong { display: block; font-size: 18px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    th, td { border-bottom: 1px solid #e2e8f0; padding: 10px 8px; text-align: left; }
    th { background: #f8fafc; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }
    .totals { margin-top: 16px; text-align: right; font-size: 16px; }
    .notes { margin-top: 20px; padding: 16px; background: #f8fafc; border-radius: 8px; font-size: 14px; }
    .toolbar { max-width: 820px; margin: 0 auto 16px; display: flex; gap: 8px; }
    button { background: #2563eb; color: white; border: 0; border-radius: 8px; padding: 10px 16px; cursor: pointer; font-size: 14px; }
    @media print {
      body { background: white; padding: 0; }
      .toolbar { display: none; }
      .page { border: 0; border-radius: 0; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="page">${body}</div>
</body>
</html>`;
}

export async function buildInvoicePrintHtml(invoice: InvoiceDoc) {
  const settings = await getQuoteSettings();
  const currency = invoice.currency || settings.currency || 'TTD';
  const paid = Number(invoice.paidAmount ?? 0);
  const balance = Math.max(0, Number(invoice.amount) - paid);

  const body = `
    <div class="header">
      <div class="brand">
        <h1>${settings.companyName}</h1>
        <p>${settings.companyAddress}</p>
        ${settings.companyPhone ? `<p>${settings.companyPhone}</p>` : ''}
        ${settings.companyWebsite ? `<p>${settings.companyWebsite}</p>` : ''}
      </div>
      <div class="meta">
        <strong>INVOICE</strong>
        <div>#${invoice.invoiceNumber}</div>
        <div>Status: ${invoice.status}</div>
        <div>Due: ${formatDate(invoice.dueDate)}</div>
      </div>
    </div>
    <p><strong>Bill to:</strong> ${invoice.client?.name ?? 'Client'}${invoice.client?.email ? ` · ${invoice.client.email}` : ''}</p>
    ${invoice.description ? `<p>${invoice.description}</p>` : ''}
    ${itemsTable(invoice.items ?? [], currency)}
    <div class="totals">
      <div><strong>Total:</strong> ${formatMoney(invoice.amount, currency)}</div>
      <div>Paid: ${formatMoney(paid, currency)}</div>
      <div><strong>Balance due:</strong> ${formatMoney(balance, currency)}</div>
    </div>
    <div class="notes">
      <strong>Payment Terms</strong><br/>${settings.paymentTerms}<br/><br/>
      ${settings.closingMessage}
    </div>`;

  return documentShell(`Invoice ${invoice.invoiceNumber}`, body);
}

export async function buildQuotePrintHtml(quote: QuoteDoc) {
  const settings = await getQuoteSettings();
  const currency = quote.currency || settings.currency || 'TTD';

  const body = `
    <div class="header">
      <div class="brand">
        <h1>${settings.companyName}</h1>
        <p>${settings.companyAddress}</p>
        ${settings.companyPhone ? `<p>${settings.companyPhone}</p>` : ''}
        ${settings.companyWebsite ? `<p>${settings.companyWebsite}</p>` : ''}
      </div>
      <div class="meta">
        <strong>QUOTE</strong>
        <div>#${quote.quoteNumber}</div>
        <div>Status: ${quote.status}</div>
        <div>Valid until: ${formatDate(quote.validUntil)}</div>
      </div>
    </div>
    <p><strong>Prepared for:</strong> ${quote.client?.name ?? 'Client'}${quote.client?.email ? ` · ${quote.client.email}` : ''}</p>
    <h2 style="margin:16px 0 8px;font-size:20px">${quote.title}</h2>
    ${quote.description ? `<p>${quote.description}</p>` : ''}
    ${itemsTable(quote.items ?? [], currency)}
    <div class="totals"><strong>Total:</strong> ${formatMoney(quote.amount, currency)}</div>
    <div class="notes">
      <strong>Payment Terms</strong><br/>${quote.terms || settings.paymentTerms}<br/><br/>
      <strong>Warranty Terms</strong><br/>${settings.warrantyTerms}<br/><br/>
      ${quote.notes ? `<strong>Notes</strong><br/>${quote.notes}<br/><br/>` : ''}
      ${settings.closingMessage}
    </div>`;

  return documentShell(`Quote ${quote.quoteNumber}`, body);
}
