// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult } from '@cd-v2/api-handlers';
import { testConnection } from '@web/lib/db';

/** Fast liveness probe — no license/security fan-out (used by startup scripts and readiness checks). */
export async function GETHandler(_ctx: ApiContext): Promise<ApiResult> {
  try {
    await testConnection();
    return {
      status: 200,
      body: {
        success: true,
        status: 'live',
        version: '2.1.0',
      },
    };
  } catch (error) {
    return {
      status: 503,
      body: {
        success: false,
        status: 'down',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    };
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
