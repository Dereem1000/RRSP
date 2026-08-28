// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, authErrorResult } from '@cd-v2/api-handlers';
import { runWithPosAccess } from '@web/lib/pos-access';
import {
  createPosInventoryLine,
  listCdPosCatalog,
  listCdPosInventory,
  listCdPosProducts,
  listShopPosCatalog,
  listShopPosInventory,
  listShopPosProducts,
} from '@web/lib/pos-catalog';

function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    return await runWithPosAccess(session, async (mode) => {
      const params = searchParamsFrom(ctx);
      const search = params.get('search') ?? undefined;
      const catalogOnly =
        params.get('catalogOnly') === '1' || params.get('catalogOnly') === 'true';
      const inventory =
        params.get('inventory') === '1' || params.get('inventory') === 'true';
      const products = inventory
        ? mode === 'rrsp'
          ? await listShopPosInventory(search)
          : await listCdPosInventory(search)
        : catalogOnly
          ? mode === 'rrsp'
            ? await listShopPosCatalog(search)
            : await listCdPosCatalog(search)
          : mode === 'rrsp'
            ? await listShopPosProducts(search)
            : await listCdPosProducts(search);
      return { status: 200, body: { success: true, products, mode, catalogOnly, inventory } };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return {
        status: Number((error as { status: number }).status) || 403,
        body: { success: false, message: error instanceof Error ? error.message : 'Access denied' },
      };
    }
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    return await runWithPosAccess(session, async (mode) => {
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      const sourceRaw = String(body.source ?? '').trim().toLowerCase();
      const source = sourceRaw === 'parts' ? ('parts' as const) : mode === 'rrsp' ? ('shop' as const) : ('cd' as const);
      const quantity = Math.max(0, Math.floor(Number(body.quantity) || 0));
      let availableQuantity =
        body.availableQuantity != null
          ? Math.max(0, Math.floor(Number(body.availableQuantity) || 0))
          : undefined;
      if (source === 'parts') {
        const listOnMarketplace =
          body.listOnMarketplace === true ||
          body.listOnMarketplace === 1 ||
          body.listOnMarketplace === '1' ||
          body.listOnMarketplace === 'true';
        availableQuantity = listOnMarketplace
          ? Math.min(quantity, availableQuantity ?? quantity)
          : 0;
      }

      const product = await createPosInventoryLine(mode, source, {
        name: String(body.name ?? ''),
        sku: body.sku != null ? String(body.sku) : null,
        description: body.description != null ? String(body.description) : null,
        unitPrice: Number(body.unitPrice),
        costPrice: body.costPrice != null ? Number(body.costPrice) : 0,
        quantity,
        availableQuantity,
        kind:
          source === 'parts'
            ? 'physical'
            : body.kind != null
              ? String(body.kind)
              : body.productKind != null
                ? String(body.productKind)
                : 'physical',
        createdBy: session.id,
      });

      return { status: 201, body: { success: true, product } };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) {
      return {
        status: Number((error as { status: number }).status) || 403,
        body: { success: false, message: error instanceof Error ? error.message : 'Access denied' },
      };
    }
    const message = error instanceof Error ? error.message : 'Failed to create product';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
