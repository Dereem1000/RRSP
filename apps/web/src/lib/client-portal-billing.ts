import { Client } from '@/lib/db';
import { SERVICE_LEVELS } from '@/lib/client-constants';
import {
  getInvoiceById,
  getQuoteById,
  listInvoicePayments,
  listInvoicesForClient,
  listQuotes,
  updateQuote,
} from '@/lib/accounting';

export async function getPortalClient(userId: number) {
  return Client.findOne({
    where: { userId },
    attributes: ['id', 'name', 'companyName', 'email', 'serviceLevel'],
  });
}

export function clientCanAccessQuotes(serviceLevel: string | null | undefined) {
  return Boolean(serviceLevel && SERVICE_LEVELS.includes(serviceLevel as (typeof SERVICE_LEVELS)[number]));
}

export async function listClientPortalInvoices(
  clientId: string,
  options: { page?: number; limit?: number; status?: string }
) {
  return listInvoicesForClient(clientId, options);
}

export async function getClientPortalInvoice(clientId: string, invoiceId: string) {
  const invoice = await getInvoiceById(invoiceId);
  if (!invoice || invoice.clientId !== clientId) return null;
  return invoice;
}

export async function getClientPortalInvoicePayments(clientId: string, invoiceId: string) {
  const invoice = await getClientPortalInvoice(clientId, invoiceId);
  if (!invoice) return null;
  const payments = await listInvoicePayments(invoiceId);
  return { invoice, payments };
}

export async function listClientPortalQuotes(
  clientId: string,
  options: { page?: number; limit?: number; status?: string }
) {
  return listQuotes({ ...options, clientId });
}

export async function getClientPortalQuote(clientId: string, quoteId: string) {
  const quote = await getQuoteById(quoteId);
  if (!quote || quote.clientId !== clientId) return null;
  return quote;
}

export async function acceptClientPortalQuote(clientId: string, quoteId: string) {
  const quote = await getClientPortalQuote(clientId, quoteId);
  if (!quote) return null;
  if (quote.status !== 'sent') throw new Error('Only sent quotes can be accepted');
  if (new Date(quote.validUntil) < new Date()) throw new Error('Quote has expired');
  return updateQuote(quoteId, { status: 'accepted' });
}

export async function declineClientPortalQuote(clientId: string, quoteId: string, reason?: string) {
  const quote = await getClientPortalQuote(clientId, quoteId);
  if (!quote) return null;
  if (quote.status !== 'sent') throw new Error('Only sent quotes can be declined');

  const notes = reason
    ? quote.notes
      ? `${quote.notes}\n\nDeclined by client. Reason: ${reason}`
      : `Declined by client. Reason: ${reason}`
    : quote.notes
      ? `${quote.notes}\n\nDeclined by client.`
      : 'Declined by client.';

  return updateQuote(quoteId, { status: 'rejected', notes });
}
