// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  authErrorResult,
} from '@cd-v2/api-handlers';

import { guardMiniApiRouteResult } from '../../mini-helpers';
import { miniProxyRequest } from '@web/lib/mini-dock';


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireSession(ctx);
    const guard = await guardMiniApiRouteResult();
    if (guard) return guard;
    const body = ctx.body as Record<string, unknown>;
    const result = await miniProxyRequest('/api/external-systems/system-logs/connection-settings', {
      method: 'POST',
      body: JSON.stringify(body),
    });
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
