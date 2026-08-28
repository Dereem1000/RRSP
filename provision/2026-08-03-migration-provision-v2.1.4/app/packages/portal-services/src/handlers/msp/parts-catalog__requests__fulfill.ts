// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import {
  fulfillPartRequestById,
  resolveStockOwnerForViewer,
} from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);
    if (!stockOwner) {
      return { status: 404, body: { success: false, message: 'Stock owner record not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const feeProvided =
      body.deliveryFee !== undefined && body.deliveryFee !== null && body.deliveryFee !== '';
    // Delivery fee is optional at fulfill — CD staff can set it later via Edit delivery.
    const result = await fulfillPartRequestById({
      requestId: String(body.requestId ?? body.id ?? ''),
      supplierClientId: stockOwner.id,
      deliveryFee: feeProvided ? Number(body.deliveryFee) : null,
    });

    return {
      status: 200,
      body: {
        success: true,
        message: `Request ${result.requestNumber} marked pending delivery`,
        result,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fulfill parts request';
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
