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

import { getClientPortalInvoicePayments, getPortalClient } from '@web/lib/client-portal-billing';
import { getWiPaySettings, isWiPayConfigured } from '@web/lib/wipay-settings';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    if (session.role !== 'client') {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    const { id } = ctx.params;
    const result = await getClientPortalInvoicePayments(client.id, id);
    if (!result) {
      return { status: 404, body: { success: false, message: 'Invoice not found' } };
    }

    const totalAmount = Number(result.invoice.amount);
    const paidAmount = Number(result.invoice.paidAmount ?? 0);
    const remainingBalance = Math.max(0, totalAmount - paidAmount);
    const wipaySettings = await getWiPaySettings();

    return { status: 200, body: {
      success: true,
      invoice: result.invoice,
      payments: result.payments,
      totalPaid: paidAmount,
      remainingBalance,
      payAvailable:
        isWiPayConfigured(wipaySettings) &&
        remainingBalance > 0 &&
        result.invoice.status !== 'paid' &&
        result.invoice.status !== 'cancelled',
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

