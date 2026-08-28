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

import { getPortalClient } from '@web/lib/client-portal-billing';
import { getClientPortalOrder } from '@web/lib/orders';


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

    const { id } = ctx.params;
    const order = await getClientPortalOrder(client.id, id);
    if (!order) {
      return { status: 404, body: { success: false, message: 'Order not found' } };
    }

    return { status: 200, body: { success: true, order } };
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

