// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { getPartsCatalogActivity } from '@web/lib/parts-catalog';

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');
    const activity = await getPartsCatalogActivity();
    return {
      status: 200,
      body: {
        success: true,
        activity,
      },
    };
  } catch (error) {
    // Keep idle pollers green during demo DB swaps / corrupt activity rows.
    if (error && typeof error === 'object' && 'status' in error) {
      return authErrorResult(error);
    }
    return {
      status: 200,
      body: {
        success: true,
        activity: { version: 0, at: '', wakeUntil: '' },
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
