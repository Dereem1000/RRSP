// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { markSellerPayablePaidOut } from '@web/lib/parts-seller-payables';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const id = String(ctx.params.id ?? '').trim();
    if (!id) {
      return { status: 400, body: { success: false, message: 'Payable id is required' } };
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const notes = typeof body.notes === 'string' ? body.notes : undefined;

    const payable = await markSellerPayablePaidOut(id, session.id, notes);
    if (!payable) {
      return { status: 404, body: { success: false, message: 'Payable not found' } };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: 'Seller payable marked paid out',
        payable,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark paid out';
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
