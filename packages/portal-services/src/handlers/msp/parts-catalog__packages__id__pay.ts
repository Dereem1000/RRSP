// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { createPartsPackagePayUrl } from '@web/lib/parts-billing';
import { ensurePartsCatalogSchema, getPortalClientByUserId } from '@web/lib/parts-catalog';
import { getRequestPublicOriginFromCtx } from '../../http-helpers';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'client');
    await ensurePartsCatalogSchema();

    const packageId = String(ctx.params.id ?? '').trim();
    if (!packageId) {
      return { status: 400, body: { success: false, message: 'Package id is required' } };
    }

    const client = await getPortalClientByUserId(session.id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    const result = await createPartsPackagePayUrl({
      packageId,
      clientId: client.id,
      origin: getRequestPublicOriginFromCtx(ctx),
    });

    return { status: 200, body: { success: true, url: result.url, invoiceId: result.invoiceId } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start payment';
    const status = message.includes('not available') ? 503 : 400;
    return { status, body: { success: false, message } };
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
