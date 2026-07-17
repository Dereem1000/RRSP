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

import { createQuote, listQuotes } from '@web/lib/accounting';


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

    const result = await listQuotes({ page, limit, status, clientId });
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
    if (!body.clientId || !body.title || body.amount == null || !body.validUntil) {
      return { status: 400, body: { success: false, message: 'clientId, title, amount, and validUntil are required' } };
    }

    const quote = await createQuote({
      clientId: body.clientId,
      title: body.title,
      amount: Number(body.amount),
      validUntil: body.validUntil,
      createdBy: session.id,
      items: body.items,
      description: body.description,
      terms: body.terms,
      notes: body.notes,
      status: body.status,
    });

    return { status: 201, body: { success: true, message: 'Quote created', quote } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create quote';
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

