import jwt, { type SignOptions } from 'jsonwebtoken';
import { getConfiguredSiteUrl, isUsablePublicOrigin, normalizeSiteBaseUrl } from '@/lib/site-url';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkey';
const VIEW_TOKEN_EXPIRES = (process.env.INVOICE_VIEW_TOKEN_EXPIRES || '60d') as SignOptions['expiresIn'];

export type InvoiceViewPayload = {
  purpose: 'invoice_view';
  invoiceId: string;
};

export type QuoteViewPayload = {
  purpose: 'quote_view';
  quoteId: string;
};

export type ViewTokenPayload = InvoiceViewPayload | QuoteViewPayload;

export function signInvoiceViewToken(invoiceId: string) {
  return jwt.sign({ invoiceId, purpose: 'invoice_view' } satisfies InvoiceViewPayload, JWT_SECRET, {
    expiresIn: VIEW_TOKEN_EXPIRES,
  });
}

export function signQuoteViewToken(quoteId: string) {
  return jwt.sign({ quoteId, purpose: 'quote_view' } satisfies QuoteViewPayload, JWT_SECRET, {
    expiresIn: VIEW_TOKEN_EXPIRES,
  });
}

export function verifyViewToken(token: string): ViewTokenPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as ViewTokenPayload;
    if (payload.purpose === 'invoice_view' && payload.invoiceId) return payload;
    if (payload.purpose === 'quote_view' && payload.quoteId) return payload;
    return null;
  } catch {
    return null;
  }
}

export function buildPublicDocumentUrl(path: string, origin?: string) {
  const base =
    getConfiguredSiteUrl() ||
    (isUsablePublicOrigin(origin) ? normalizeSiteBaseUrl(origin) : null) ||
    'http://localhost:3000';
  return `${base}${path}`;
}

export function buildInvoicePublicPrintUrl(invoiceId: string, origin?: string) {
  const token = signInvoiceViewToken(invoiceId);
  return buildPublicDocumentUrl(`/api/public/invoice/${encodeURIComponent(token)}/print`, origin);
}

export function buildQuotePublicPrintUrl(quoteId: string, origin?: string) {
  const token = signQuoteViewToken(quoteId);
  return buildPublicDocumentUrl(`/api/public/quote/${encodeURIComponent(token)}/print`, origin);
}
