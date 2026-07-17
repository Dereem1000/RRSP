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

import { deleteQuote, getQuoteById, updateQuote } from '@web/lib/accounting';


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
    const quote = await getQuoteById(id);
    if (!quote) {
      return { status: 404, body: { success: false, message: 'Quote not found' } };
    }
    return { status: 200, body: { success: true, quote } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    const quote = await updateQuote(id, body);
    if (!quote) {
      return { status: 404, body: { success: false, message: 'Quote not found' } };
    }
    return { status: 200, body: { success: true, message: 'Quote updated', quote } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update quote';
    return { status: 500, body: { success: false, message } };
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const deleted = await deleteQuote(id);
    if (!deleted) {
      return { status: 404, body: { success: false, message: 'Quote not found' } };
    }
    return { status: 200, body: { success: true, message: 'Quote deleted' } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete quote';
    const status = message.includes('Cannot delete') ? 400 : 500;
    return { status: 200, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

