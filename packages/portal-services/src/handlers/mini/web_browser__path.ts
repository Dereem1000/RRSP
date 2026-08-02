import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { miniProxyRequest } from '@web/lib/mini-dock';
import { guardMiniApiRouteResult } from '../../mini-helpers';

async function proxyWebBrowser(ctx: ApiContext, method: 'GET' | 'POST'): Promise<ApiResult> {
  requireSession(ctx);
  const guard = await guardMiniApiRouteResult();
  if (guard) return guard;

  const segments = (ctx.params.path || '').split('/').filter(Boolean);
  const suffix = segments.join('/');
  const target = suffix
    ? `/api/external-systems/web-browser/${suffix}`
    : '/api/external-systems/web-browser';
  const init: RequestInit = { method };

  if (method === 'POST') {
    init.body = JSON.stringify(ctx.body ?? {});
  }

  const result = await miniProxyRequest(target, init, {
    updateOnlineCache: false,
  });
  return { status: result.status, body: result.body };
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return proxyWebBrowser(ctx, 'GET');
    if (method === 'POST') return proxyWebBrowser(ctx, 'POST');
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
