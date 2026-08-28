// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { markPartsPackageCashPaid } from '@web/lib/parts-billing';
import { ensurePartsCatalogSchema, touchPartsCatalogActivity } from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');
    await ensurePartsCatalogSchema();

    const packageId = String(ctx.params.id ?? '').trim();
    if (!packageId) {
      return { status: 400, body: { success: false, message: 'Package id is required' } };
    }

    const billing = await markPartsPackageCashPaid({
      packageId,
      processedBy: session.id,
    });

    await touchPartsCatalogActivity('parts-cash-paid');

    return {
      status: 200,
      body: {
        success: true,
        message: 'Package marked paid (cash)',
        billing,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark cash paid';
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
