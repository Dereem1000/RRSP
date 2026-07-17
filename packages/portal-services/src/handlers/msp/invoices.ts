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

import { createInvoice, listMspInvoices, sendInvoiceEmail } from '@web/lib/accounting';


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

    const searchParams = searchParamsFrom(ctx);
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);
    const status = searchParams.get('status') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;

    const result = await listMspInvoices({ page, limit, status, clientId });
    return { status: 200, body: { success: true, ...result } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const body = ctx.body as Record<string, unknown>;
    const invoice = await createInvoice({
      clientId: String(body.clientId),
      amount: Number(body.amount),
      currency: body.currency,
      dueDate: String(body.dueDate),
      createdBy: session.id,
      billingCycle: body.billingCycle,
      paymentGateway: body.paymentGateway,
      description: body.description ?? null,
      items: body.items ?? [],
      status: body.status,
    });

    if (!invoice) {
      return { status: 500, body: { success: false, message: 'Failed to create invoice' } };
    }

    if (body.sendEmail) {
      const origin = ctx.header('origin') ?? undefined;
      sendInvoiceEmail(invoice.id, { origin, type: 'created' }).catch((err) =>
        console.error('[INVOICE CREATE EMAIL]', err)
      );
    }

    return { status: 201, body: { success: true, message: 'Invoice created', invoice } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    return { status: 500, body: { success: false, message } };
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

