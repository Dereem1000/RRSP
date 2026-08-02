// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { acceptPartsPackageQuote, getDeliveryPackageById } from '@web/lib/parts-billing';
import {
  ensurePartsCatalogSchema,
  getPortalClientByUserId,
  touchPartsCatalogActivity,
} from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'client', 'admin', 'technician');
    await ensurePartsCatalogSchema();

    const packageId = String(ctx.params.id ?? '').trim();
    if (!packageId) {
      return { status: 400, body: { success: false, message: 'Package id is required' } };
    }

    let clientId: string | null = null;
    if (session.role === 'client') {
      const client = await getPortalClientByUserId(session.id);
      if (!client) {
        return { status: 404, body: { success: false, message: 'Client record not found' } };
      }
      clientId = client.id;
    } else {
      const body = (ctx.body ?? {}) as Record<string, unknown>;
      clientId = String(body.clientId ?? '').trim() || null;
      if (!clientId) {
        const pkg = await getDeliveryPackageById(packageId);
        clientId = pkg?.buyerClientId?.trim() || null;
      }
      if (!clientId) {
        return { status: 400, body: { success: false, message: 'Buyer client is required' } };
      }
    }

    const result = await acceptPartsPackageQuote({
      packageId,
      clientId,
      createdBy: session.id,
    });

    await touchPartsCatalogActivity('parts-quote-accepted');

    return {
      status: 200,
      body: {
        success: true,
        message: 'Quote accepted and invoice created',
        billing: result.billing,
        quote: result.quote,
        invoice: result.invoice,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept parts quote';
    const status =
      message.includes('Access denied') || message.includes('not found')
        ? message.includes('Access denied')
          ? 403
          : 404
        : 400;
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
