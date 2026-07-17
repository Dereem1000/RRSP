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

import { emitMiniCdEvent } from '@web/lib/mini-cd-events.server';
import { markInvoicePaid, sendInvoiceEmail } from '@web/lib/accounting';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const body = (ctx.body ?? {}) as Record<string, unknown>;

    const invoice = await markInvoicePaid(id, session.id, {
      paymentDate: body.paymentDate,
      paymentMethod: body.paymentMethod,
      paymentNotes: body.paymentNotes,
    });

    if (!invoice) {
      return { status: 404, body: { success: false, message: 'Invoice not found' } };
    }

    if (body.sendEmail === true) {
      const origin = ctx.header('origin') ?? undefined;
      sendInvoiceEmail(id, { origin, type: 'paid' }).catch((err) => console.error('[INVOICE PAID EMAIL]', err));
    }

    emitMiniCdEvent(session, {
      type: 'invoice.paid',
      summary: `Marked invoice ${invoice.invoiceNumber} paid for ${invoice.client?.name ?? 'client'} (TTD ${invoice.amount})`,
      entityType: 'invoice',
      entityId: invoice.id,
      href: `/accounting?invoice=${invoice.id}`,
      clientId: invoice.clientId ?? undefined,
      clientName: invoice.client?.name ?? undefined,
      actorName: session.username ?? undefined,
      metadata: { amount: invoice.amount, status: invoice.status },
    });

    return { status: 200, body: { success: true, message: 'Invoice marked as paid', invoice } };
  } catch (error) {
    if (error instanceof Error && error.message.includes('already')) {
      return { status: 400, body: { success: false, message: error.message } };
    }
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'PUT') return PUTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

