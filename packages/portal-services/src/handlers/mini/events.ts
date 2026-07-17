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
import {
  isMiniDockConfigured,
  MINI_CD_EVENT_PROXY_TIMEOUT_MS,
  MINI_READ_PROXY_TIMEOUT_MS,
  miniApiUnavailableReason,
  miniProxyRequest,
} from '@web/lib/mini-dock';


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

    const limit = searchParamsFrom(ctx).get('limit') || '20';
    const result = await miniProxyRequest(
      `/api/cd/events/recent?limit=${encodeURIComponent(limit)}`,
      { method: 'GET' },
      { timeoutMs: MINI_READ_PROXY_TIMEOUT_MS },
    );
    return { status: result.status, body: result.body };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireSession(ctx);
    if (!(await isMiniDockConfigured())) {
      return { status: 202, body: { ok: false, skipped: true } };
    }
    const unavailable = await miniApiUnavailableReason();
    if (unavailable) {
      return { status: 202, body: { ok: false, skipped: true, reason: unavailable } };
    }

    const body = ctx.body as Record<string, unknown>;
    const result = await miniProxyRequest(
      '/api/cd/events',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { timeoutMs: MINI_CD_EVENT_PROXY_TIMEOUT_MS, updateOnlineCache: false },
    );
    if (result.status === 504 || result.status === 502) {
      return { status: 202, body: { ok: false, skipped: true, reason: 'timeout' } };
    }
    return { status: result.status, body: result.body };
  } catch (error) {
    return authErrorResult(error);
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

