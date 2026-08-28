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

import { buildQuotePrintHtml } from '@web/lib/document-html';
import {
  clientCanAccessQuotes,
  getClientPortalQuote,
  getPortalClient,
} from '@web/lib/client-portal-billing';


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

    if (!clientCanAccessQuotes(client.serviceLevel)) {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const { id } = ctx.params;
    const quote = await getClientPortalQuote(client.id, id);
    if (!quote) {
      return { status: 404, body: { success: false, message: 'Quote not found' } };
    }

    const html = await buildQuotePrintHtml(quote);
    return { status: 200, rawBody: html, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } };
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

