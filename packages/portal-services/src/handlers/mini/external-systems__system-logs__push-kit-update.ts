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
import { MINI_KIT_PUSH_TIMEOUT_MS, miniProxyRequest } from '@web/lib/mini-dock';


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
    requireSession(ctx);
    const guard = await guardMiniApiRouteResult();
    if (guard) return guard;
    const body = ctx.body as Record<string, unknown>;
    const result = await miniProxyRequest(
      '/api/external-systems/system-logs/push-kit-update',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { timeoutMs: MINI_KIT_PUSH_TIMEOUT_MS, updateOnlineCache: false },
    );
    const payload =
      result.body && typeof result.body === 'object'
        ? (result.body as Record<string, unknown>)
        : {};
    if (!result.ok) {
      const message =
        (typeof payload.error === 'string' && payload.error) ||
        (typeof payload.message === 'string' && payload.message) ||
        `Mini returned HTTP ${result.status}`;
      return {
        status: result.status,
        body: { ...payload, error: message },
      };
    }
    if (typeof payload.error === 'string' && payload.error.trim()) {
      return { status: 400, body: payload };
    }
    return { status: result.status, body: result.body };
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

