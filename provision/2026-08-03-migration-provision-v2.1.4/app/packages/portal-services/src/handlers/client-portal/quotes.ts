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

import {
  clientCanAccessQuotes,
  getPortalClient,
  listClientPortalQuotes,
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
      return { status: 403, body: {
          success: false,
          message:
            'You do not have an active service level. Please contact support to upgrade your service plan to access quotes.',
        } };
    }

    const searchParams = searchParamsFrom(ctx);
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);
    const status = searchParams.get('status') ?? undefined;

    const result = await listClientPortalQuotes(client.id, { page, limit, status });
    return { status: 200, body: { success: true, ...result } };
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

