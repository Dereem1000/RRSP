// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import {
  createPartRequest,
  getPortalClientByUserId,
  resolveStockOwnerForViewer,
} from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const client = session.role === 'client' ? await getPortalClientByUserId(session.id) : null;
    if (session.role === 'client' && !client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);

    const body = ctx.body as Record<string, unknown>;
    const preferredInventoryId =
      typeof body.preferredInventoryId === 'string'
        ? body.preferredInventoryId
        : typeof body.inventoryId === 'string'
          ? body.inventoryId
          : null;
    const request = await createPartRequest({
      itemName: String(body.itemName ?? ''),
      quantity: Number(body.quantity),
      requesterUserId: session.id,
      requesterRole: session.role,
      buyerClientId: client?.id ?? null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      preferredInventoryId,
      excludeSupplierClientId: stockOwner?.id ? String(stockOwner.id) : null,
    });

    return {
      status: 201,
      body: {
        success: true,
        message: `Request ${request.requestNumber} has been sent through the platform`,
        request,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create parts request';
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
