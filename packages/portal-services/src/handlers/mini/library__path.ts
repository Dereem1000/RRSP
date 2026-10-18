import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { encodeMiniApiPath, miniProxyRequest } from '@web/lib/mini-dock';
import { guardMiniApiRouteResult } from '../../mini-helpers';

function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, String(value));
  }
  return params;
}

async function proxyLibrary(ctx: ApiContext, method: 'GET' | 'POST'): Promise<ApiResult> {
  requireSession(ctx);
  const guard = await guardMiniApiRouteResult();
  if (guard) return guard;

  let pathTail = String(ctx.params.path || '').trim();
  if (!pathTail) {
    const normalized = String(ctx.path || '').replace(/\/+/g, '/');
    const prefix = '/mini/library/';
    if (normalized.startsWith(prefix)) {
      pathTail = normalized.slice(prefix.length);
    }
  }
  const segments = pathTail.split('/').filter(Boolean);
  let target = encodeMiniApiPath(`/api/library/${segments.join('/')}`);
  const qs = searchParamsFrom(ctx);
  const query = qs.toString();
  if (query) target += `?${query}`;

  const init: RequestInit = { method };

  if (method === 'POST') {
    init.body = JSON.stringify(ctx.body ?? {});
  }

  const result = await miniProxyRequest(target, init);
  return { status: result.status, body: result.body };
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return proxyLibrary(ctx, 'GET');
    if (method === 'POST') return proxyLibrary(ctx, 'POST');
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
