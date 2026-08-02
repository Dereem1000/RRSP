import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { MINI_READ_PROXY_TIMEOUT_MS, miniProxyRequest } from '@web/lib/mini-dock';
import { guardMiniApiRouteResult } from '../../mini-helpers';

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireSession(ctx);
    const guard = await guardMiniApiRouteResult();
    if (guard) return guard;

    const result = await miniProxyRequest(
      '/api/external-systems/web-browser',
      { method: 'GET' },
      { timeoutMs: MINI_READ_PROXY_TIMEOUT_MS, updateOnlineCache: false },
    );
    return { status: result.status, body: result.body };
  } catch (error) {
    return authErrorResult(error);
  }
}
