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

import { sendInvoiceEmail } from '@web/lib/accounting';


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
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const origin = ctx.header('origin') ?? undefined;
    const invoice = await sendInvoiceEmail(id, {
      clientEmail: body.clientEmail,
      origin,
      type: body.type ?? 'created',
      sentBy: session.id,
    });
    if (!invoice) {
      return { status: 404, body: { success: false, message: 'Invoice not found' } };
    }
    return { status: 200, body: { success: true, message: 'Invoice email sent', invoice, emailSent: true } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send invoice email';
    const status = message.includes('email') ? 400 : 500;
    return { status: 200, body: { success: false, message } };
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

