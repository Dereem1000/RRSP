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

import { addOrderLink, listOrderLinks } from '@web/lib/orders';


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
    const links = await listOrderLinks(id);
    return { status: 200, body: { success: true, links } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    if (!body.linkedType || !body.linkedId || !body.linkedNumber) {
      return { status: 400, body: { success: false, message: 'linkedType, linkedId, and linkedNumber are required' } };
    }

    const link = await addOrderLink(
      id,
      {
        linkedType: body.linkedType,
        linkedId: String(body.linkedId),
        linkedNumber: String(body.linkedNumber),
        notes: body.notes ?? null,
      },
      session.id
    );

    if (!link) {
      return { status: 404, body: { success: false, message: 'Order not found' } };
    }

    return { status: 201, body: { success: true, message: 'Link created', link } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create link';
    return { status: 400, body: { success: false, message } };
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

