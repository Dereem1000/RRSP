// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import {
  deleteInventoryListing,
  resolveStockOwnerForViewer,
  updateInventoryListing,
} from '@web/lib/parts-catalog';

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);
    if (!stockOwner) {
      return { status: 404, body: { success: false, message: 'Stock owner record not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const listing = await updateInventoryListing(String(ctx.params.id), {
      clientId: stockOwner.id,
      itemName: String(body.itemName ?? ''),
      partNumber: typeof body.partNumber === 'string' ? body.partNumber : null,
      brand: typeof body.brand === 'string' ? body.brand : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      unitPrice: Number(body.unitPrice),
      quantity: Number(body.quantity),
      availableQuantity: Number(body.availableQuantity),
      category: typeof body.category === 'string' ? body.category : null,
      itemCondition: typeof body.itemCondition === 'string' ? body.itemCondition : null,
      imageFile: typeof body.imageFile === 'string' ? body.imageFile : null,
      imageFiles: Array.isArray(body.imageFiles)
        ? body.imageFiles.map((f) => String(f)).filter(Boolean)
        : null,
      verificationVideoFile:
        typeof body.verificationVideoFile === 'string' ? body.verificationVideoFile : null,
      requiresVerification: Boolean(body.requiresVerification),
    });

    return { status: 200, body: { success: true, listing } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update listing';
    return { status: 400, body: { success: false, message } };
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);
    if (!stockOwner) {
      return { status: 404, body: { success: false, message: 'Stock owner record not found' } };
    }

    const deleted = await deleteInventoryListing(String(ctx.params.id), stockOwner.id);
    if (!deleted) {
      return { status: 404, body: { success: false, message: 'Listing not found' } };
    }

    return { status: 200, body: { success: true } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
