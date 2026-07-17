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

import { addInvoicePayment, listInvoicePayments, sendInvoiceEmail } from '@web/lib/accounting';


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
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const payments = await listInvoicePayments(id);
    return { status: 200, body: { success: true, payments } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;

    const result = await addInvoicePayment(id, session.id, {
      amount: Number(body.amount),
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      notes: body.notes,
      paymentDate: body.paymentDate,
    });

    if (!result) {
      return { status: 404, body: { success: false, message: 'Invoice not found' } };
    }

    if (body.sendEmail === true) {
      const origin = ctx.header('origin') ?? undefined;
      const emailType = result.invoice?.status === 'paid' ? 'paid' : 'partial';
      sendInvoiceEmail(id, {
        origin,
        type: emailType,
        paymentAmount: Number(body.amount),
      }).catch((err) => console.error('[INVOICE PAYMENT EMAIL]', err));
    }

    return { status: 200, body: {
      success: true,
      message: 'Payment added',
      invoice: result.invoice,
      payment: result.payment,
      remainingBalance: result.remainingBalance,
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

