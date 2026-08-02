// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { createInventoryListing, resolveStockOwnerForViewer } from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);
    if (!stockOwner) {
      return { status: 404, body: { success: false, message: 'Stock owner record not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const listing = await createInventoryListing({
      clientId: stockOwner.id,
      createdBy: session.id,
      itemName: String(body.itemName ?? ''),
      partNumber: typeof body.partNumber === 'string' ? body.partNumber : null,
      brand: typeof body.brand === 'string' ? body.brand : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      unitPrice: Number(body.unitPrice),
      quantity: Number(body.quantity),
    });

    return { status: 201, body: { success: true, listing } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create listing';
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
