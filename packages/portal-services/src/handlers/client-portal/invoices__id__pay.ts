// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { getClientPortalInvoice, getPortalClient } from '@web/lib/client-portal-billing';
import { createWiPayPaymentUrl } from '@web/lib/wipay';
import { getWiPaySettings, isWiPayConfigured } from '@web/lib/wipay-settings';
import { getRequestPublicOrigin } from '@web/lib/site-url';
import { getRequestPublicOriginFromCtx } from '../../http-helpers';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    if (session.role !== 'client') {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const settings = await getWiPaySettings();
    if (!isWiPayConfigured(settings)) {
      return { status: 503, body: { success: false, message: 'Online payments are not available right now.' } };
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    const { id } = ctx.params;
    const invoice = await getClientPortalInvoice(client.id, id);
    if (!invoice) {
      return { status: 404, body: { success: false, message: 'Invoice not found' } };
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return { status: 400, body: { success: false, message: 'This invoice cannot be paid online.' } };
    }

    const totalAmount = Number(invoice.amount);
    const paidAmount = Number(invoice.paidAmount ?? 0);
    const remainingBalance = Math.max(0, totalAmount - paidAmount);
    if (remainingBalance <= 0) {
      return { status: 400, body: { success: false, message: 'This invoice is already paid.' } };
    }

    const { url } = await createWiPayPaymentUrl(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: client.id,
        amount: remainingBalance,
        currency: invoice.currency || 'TTD',
        customerEmail: client.email,
        customerName: client.name || client.companyName,
        customerPhone: client.phone,
      },
      getRequestPublicOriginFromCtx(ctx)
    );

    return { status: 200, body: { success: true, url } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start payment';
    return { status: 500, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

