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
import { buildQuotePrintHtml } from '@web/lib/document-html';
import { verifyViewToken } from '@web/lib/view-tokens';


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
    const { token } = ctx.params;
    const payload = verifyViewToken(decodeURIComponent(token));
    if (!payload || payload.purpose !== 'quote_view') {
      return { status: 401, rawBody: 'This link is invalid or has expired.' };
    }

    const quote = await getQuoteById(payload.quoteId);
    if (!quote) {
      return { status: 404, rawBody: 'Quote not found.' };
    }

    const html = await buildQuotePrintHtml(quote);
    return { status: 200, rawBody: html, headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      } };
  } catch (error) {
    console.error('[PUBLIC QUOTE PRINT]', error);
    return { status: 500, rawBody: 'Failed to generate quote document.' };
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

