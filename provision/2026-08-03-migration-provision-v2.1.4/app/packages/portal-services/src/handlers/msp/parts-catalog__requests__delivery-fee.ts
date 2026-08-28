// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import {
  resolveStockOwnerForViewer,
  updatePartRequestDeliveryFee,
} from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    // Post-fulfill delivery fee edits are CD staff logistics (not client suppliers).
    requireRole(session, 'admin', 'technician');

    const body = ctx.body as Record<string, unknown>;
    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);

    const result = await updatePartRequestDeliveryFee({
      requestId: String(body.requestId ?? body.id ?? ''),
      deliveryFee: Number(body.deliveryFee),
      supplierClientId: stockOwner?.id ?? null,
      allowStaffOverride: true,
    });

    return {
      status: 200,
      body: {
        success: true,
        message: `Delivery fee updated for request ${result.requestNumber}`,
        result,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to update parts delivery fee';
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
