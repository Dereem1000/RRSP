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

import { getQuoteById } from '@web/lib/accounting';
import { buildPublicDocumentUrl, signQuoteViewToken } from '@web/lib/view-tokens';


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

    const { id } = ctx.params;
    const quote = await getQuoteById(id);
    if (!quote) {
      return { status: 404, body: { success: false, message: 'Quote not found' } };
    }

    const token = signQuoteViewToken(id);
    const encoded = encodeURIComponent(token);
    const origin = ctx.header('origin') ?? undefined;

    return { status: 200, body: {
      success: true,
      token,
      viewUrl: buildPublicDocumentUrl(`/api/public/quote/${encoded}/print`, origin),
      apiUrl: buildPublicDocumentUrl(`/api/public/quote/${encoded}`, origin),
      expiresIn: process.env.INVOICE_VIEW_TOKEN_EXPIRES || '60d',
    } };
  } catch (error) {
    return authErrorResult(error);
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

