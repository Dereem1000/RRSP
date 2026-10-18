// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { requestSellerPartVerification } from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const body = ctx.body as Record<string, unknown>;
    const request = await requestSellerPartVerification({
      requestId: String(body.requestId ?? body.id ?? ''),
      staffUserId: session.id,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });

    return {
      status: 200,
      body: { success: true, request },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to request seller verification';
    return { status: 400, body: { success: false, message } };
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
