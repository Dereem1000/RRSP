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

import { sendClientLicenseEmail } from '@web/lib/license-email';


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
    requireRole(session, 'admin', 'technician');

    const { clientId } = ctx.params;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return { status: 400, body: { success: false, message: 'Password is required' } };
    }

    const origin = ctx.header('origin') ?? undefined;
    const result = await sendClientLicenseEmail({
      clientId,
      password,
      staffUserId: session.id,
      origin,
    });

    return { status: 200, body: {
      success: true,
      message: `License details emailed to ${result.clientEmail}`,
      ...result,
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send license email';
    const status =
      message === 'Incorrect password' ? 401 : message.includes('email') ? 400 : 500;
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

