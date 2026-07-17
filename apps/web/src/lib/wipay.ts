import { createHash } from 'crypto';
import { getSequelize } from '@cd-v2/database';
import { QueryTypes } from 'sequelize';
import { addInvoicePayment } from '@/lib/accounting';
import { resolvePublicSiteBaseUrl } from '@/lib/site-url';
import { getWiPaySettings, isWiPayConfigured, type WiPaySettings } from '@/lib/wipay-settings';

const WIPAY_API_URL = 'https://tt.wipayfinancial.com/plugins/payments/request';

export type WiPayPaymentInput = {
  invoiceId: string;
  invoiceNumber: string;
  clientId: string;
  amount: number;
  currency: string;
  customerEmail?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
};

export type WiPayResponseParams = {
  status?: string;
  transaction_id?: string;
  order_id?: string;
  total?: string;
  hash?: string;
  message?: string;
  data?: string;
};

function sanitizeOrderId(invoiceNumber: string) {
  const base = invoiceNumber.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32) || 'inv';
  const suffix = Date.now().toString(36);
  return `inv${base}${suffix}`.slice(0, 48);
}

function formatAmount(amount: number) {
  return Math.max(1, amount).toFixed(2);
}

export async function buildWiPayResponseUrl(requestOrigin?: string) {
  const base = await resolvePublicSiteBaseUrl(requestOrigin);
  return `${base}/api/payments/wipay/response`;
}

export async function createWiPayPaymentUrl(
  input: WiPayPaymentInput,
  requestOrigin?: string
): Promise<{ url: string; orderId: string }> {
  const settings = await getWiPaySettings();
  if (!isWiPayConfigured(settings)) {
    throw new Error('Online payments are not configured. Contact support.');
  }

  const orderId = sanitizeOrderId(input.invoiceNumber);
  const responseUrl = await buildWiPayResponseUrl(requestOrigin);
  const payload = new URLSearchParams({
    account_number: settings.environment === 'sandbox' ? '1234567890' : settings.accountNumber,
    avs: '0',
    country_code: settings.countryCode,
    currency: input.currency || 'TTD',
    data: JSON.stringify({
      invoiceId: input.invoiceId,
      clientId: input.clientId,
    }),
    environment: settings.environment,
    fee_structure: settings.feeStructure,
    method: 'credit_card',
    order_id: orderId,
    origin: settings.origin,
    response_url: responseUrl,
    total: formatAmount(input.amount),
  });

  if (input.customerEmail?.trim()) payload.set('email', input.customerEmail.trim());
  if (input.customerName?.trim()) payload.set('name', input.customerName.trim());
  if (input.customerPhone?.trim()) payload.set('phone', input.customerPhone.trim());

  const response = await fetch(WIPAY_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: payload.toString(),
  });

  const text = await response.text();
  let result: { url?: string; message?: string; transaction_id?: string };
  try {
    result = JSON.parse(text) as typeof result;
  } catch {
    throw new Error('Could not start online payment. Please try again or contact support.');
  }

  if (!response.ok || !result.url) {
    throw new Error(result.message || 'Could not start online payment.');
  }

  return { url: result.url, orderId };
}

export function verifyWiPayResponseHash(params: WiPayResponseParams, settings: WiPaySettings) {
  if (!params.hash || !params.transaction_id || !params.total) return false;
  const expected = createHash('md5')
    .update(`${params.transaction_id}${params.total}${settings.apiKey}`)
    .digest('hex');
  return expected === params.hash;
}

export function parseWiPayData(data?: string) {
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as { invoiceId?: string; clientId?: string };
    if (!parsed.invoiceId || !parsed.clientId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function paymentReferenceExists(reference: string) {
  const sequelize = getSequelize();
  const rows = await sequelize.query<{ id: string }>(
    `SELECT id FROM payments WHERE reference = :reference LIMIT 1`,
    { type: QueryTypes.SELECT, replacements: { reference } }
  );
  return rows.length > 0;
}

export async function recordWiPayPayment(params: WiPayResponseParams) {
  const settings = await getWiPaySettings();
  if (params.status !== 'success') {
    return { ok: false as const, reason: params.message || 'Payment was not completed.' };
  }

  if (!verifyWiPayResponseHash(params, settings)) {
    return { ok: false as const, reason: 'Payment verification failed.' };
  }

  const meta = parseWiPayData(params.data);
  if (!meta) {
    return { ok: false as const, reason: 'Invalid payment metadata.' };
  }

  const transactionId = params.transaction_id!;
  if (await paymentReferenceExists(transactionId)) {
    return { ok: true as const, invoiceId: meta.invoiceId, duplicate: true };
  }

  const amount = Number(params.total);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false as const, reason: 'Invalid payment amount.' };
  }

  if (!meta.invoiceId) {
    return { ok: false as const, reason: 'Invalid payment metadata.' };
  }

  const result = await addInvoicePayment(meta.invoiceId, 1, {
    amount,
    paymentMethod: 'wipay',
    reference: transactionId,
    notes: params.message ? `WiPay: ${params.message}` : 'Paid online via WiPay',
  });

  if (!result) {
    return { ok: false as const, reason: 'Invoice not found.' };
  }

  return { ok: true as const, invoiceId: meta.invoiceId, duplicate: false, invoice: result.invoice };
}
