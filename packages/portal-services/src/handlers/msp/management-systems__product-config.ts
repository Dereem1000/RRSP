// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import { getProductCatalog, saveProductCatalog } from '@web/lib/management-system-product-config';

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');
    const catalog = await getProductCatalog();
    return { status: 200, body: { success: true, catalog } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');
    const body = ctx.body as Record<string, unknown>;
    const catalog = await saveProductCatalog((body.catalog || body) as Parameters<typeof saveProductCatalog>[0]);
    return { status: 200, body: { success: true, catalog } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save product config';
    return { status: 500, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  if (method === 'GET') return GETHandler(ctx);
  if (method === 'PUT') return PUTHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
