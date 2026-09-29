// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, authErrorResult } from '@cd-v2/api-handlers';
import { runWithPosAccess, assertPosInventoryEditAllowed } from '@web/lib/pos-access';
import {
  adjustPosInventoryStock,
  deactivatePosInventoryLine,
  updatePosInventoryLine,
} from '@web/lib/pos-catalog';

function resolveSource(
  mode: 'cd' | 'rrsp',
  body: Record<string, unknown>,
  query?: Record<string, string | string[] | undefined>
) {
  const querySource = Array.isArray(query?.source) ? query.source[0] : query?.source;
  const sourceRaw = String(body.source ?? querySource ?? '').trim().toLowerCase();
  return sourceRaw === 'parts' ? ('parts' as const) : mode === 'rrsp' ? ('shop' as const) : ('cd' as const);
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    await assertPosInventoryEditAllowed(session);
    return await runWithPosAccess(session, async (mode) => {
      const id = String(ctx.params?.id ?? '');
      if (!id) return { status: 400, body: { success: false, message: 'Product id required' } };

      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const quantity = Math.max(0, Math.floor(Number(body.quantity) || 0));
      const source = resolveSource(mode, body, ctx.query);

      // Parts: Available is marketplace-only. Off-marketplace listings force available = 0.
      let availableQuantity = Math.max(
        0,
        Math.floor(
          body.availableQuantity != null ? Number(body.availableQuantity) || 0 : quantity
        )
      );
      if (source === 'parts') {
        const listOnMarketplace =
          body.listOnMarketplace === true ||
          body.listOnMarketplace === 1 ||
          body.listOnMarketplace === '1' ||
          body.listOnMarketplace === 'true';
        availableQuantity = listOnMarketplace ? Math.min(availableQuantity, quantity) : 0;
      } else {
        availableQuantity = Math.min(availableQuantity, quantity);
      }

      const product = await updatePosInventoryLine(mode, id, source, {
        name: String(body.name ?? ''),
        sku: body.sku != null ? String(body.sku) : null,
        description: body.description != null ? String(body.description) : null,
        unitPrice: Number(body.unitPrice),
        costPrice: body.costPrice != null ? Number(body.costPrice) : 0,
        quantity,
        availableQuantity,
        kind:
          body.kind != null
            ? String(body.kind)
            : body.productKind != null
              ? String(body.productKind)
              : 'physical',
      });

      return { status: 200, body: { success: true, product } };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return {
        status: Number((error as { status: number }).status) || 403,
        body: { success: false, message: error instanceof Error ? error.message : 'Access denied' },
      };
    }
    const message = error instanceof Error ? error.message : 'Failed to update product';
    return { status: 400, body: { success: false, message } };
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    await assertPosInventoryEditAllowed(session);
    return await runWithPosAccess(session, async (mode) => {
      const id = String(ctx.params?.id ?? '');
      if (!id) return { status: 400, body: { success: false, message: 'Product id required' } };

      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const action = String(body.action ?? body.stockAction ?? '').trim().toLowerCase();
      if (action !== 'add' && action !== 'remove' && action !== 'receive_po') {
        return {
          status: 400,
          body: {
            success: false,
            message: 'Stock action must be add, remove, or receive_po',
          },
        };
      }

      const product = await adjustPosInventoryStock(mode, id, resolveSource(mode, body, ctx.query), {
        action,
        quantity: Number(body.quantity),
        poNumber: body.poNumber != null ? String(body.poNumber) : null,
        note: body.note != null ? String(body.note) : null,
      });

      return { status: 200, body: { success: true, product } };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return {
        status: Number((error as { status: number }).status) || 403,
        body: { success: false, message: error instanceof Error ? error.message : 'Access denied' },
      };
    }
    const message = error instanceof Error ? error.message : 'Failed to adjust stock';
    return { status: 400, body: { success: false, message } };
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    await assertPosInventoryEditAllowed(session);
    return await runWithPosAccess(session, async (mode) => {
      const id = String(ctx.params?.id ?? '');
      if (!id) return { status: 400, body: { success: false, message: 'Product id required' } };

      const body = (ctx.body ?? {}) as Record<string, unknown>;
      await deactivatePosInventoryLine(mode, id, resolveSource(mode, body, ctx.query));
      return { status: 200, body: { success: true } };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return {
        status: Number((error as { status: number }).status) || 403,
        body: { success: false, message: error instanceof Error ? error.message : 'Access denied' },
      };
    }
    const message = error instanceof Error ? error.message : 'Failed to remove product';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
