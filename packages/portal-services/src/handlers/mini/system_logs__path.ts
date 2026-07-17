import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { MINI_KIT_PUSH_TIMEOUT_MS, miniProxyRequest } from '@web/lib/mini-dock';
import { guardMiniApiRouteResult } from '../../mini-helpers';

async function proxySystemLogs(ctx: ApiContext, method: 'GET' | 'POST'): Promise<ApiResult> {
  requireSession(ctx);
  const guard = await guardMiniApiRouteResult();
  if (guard) return guard;

  const segments = (ctx.params.path || '').split('/').filter(Boolean);
  const target = `/api/external-systems/system-logs/${segments.join('/')}`;
  const init: RequestInit = { method };

  if (method === 'POST') {
    init.body = JSON.stringify(ctx.body ?? {});
  }

  const action = segments.join('/');
  const timeoutMs = action === 'push-kit-update' ? MINI_KIT_PUSH_TIMEOUT_MS : undefined;

  const result = await miniProxyRequest(
    target,
    init,
    timeoutMs ? { timeoutMs, updateOnlineCache: false } : undefined,
  );
  return { status: result.status, body: result.body };
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return proxySystemLogs(ctx, 'GET');
    if (method === 'POST') return proxySystemLogs(ctx, 'POST');
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
