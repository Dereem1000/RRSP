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

import { guardMiniApiRouteResult } from '../../mini-helpers';
import { miniProxyRequest } from '@web/lib/mini-dock';


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
    requireSession(ctx);
    const guard = await guardMiniApiRouteResult();
    if (guard) return guard;

    const { connectionId } = ctx.params;
    const id = String(connectionId || '').trim();
    if (!id) {
      return { status: 400, body: { error: 'connectionId is required' } };
    }

    const limit = searchParamsFrom(ctx).get('limit') || '200';
    const result = await miniProxyRequest(
      `/api/external-systems/system-logs/connections/${encodeURIComponent(id)}/logs?limit=${encodeURIComponent(limit)}`,
      { method: 'GET' }
    );
    return { status: result.status, body: result.body };
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

