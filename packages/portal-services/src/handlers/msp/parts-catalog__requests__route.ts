// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { getCompanySettings } from '@web/lib/company-settings';
import {
  resolveStockOwnerForViewer,
  updateStaffFulfillmentRoute,
} from '@web/lib/parts-catalog';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);
    if (!stockOwner) {
      return { status: 404, body: { success: false, message: 'Stock owner record not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const actionRaw = String(body.action ?? '').trim().toLowerCase();
    const action =
      actionRaw === 'remove' || actionRaw === 'reset' || actionRaw === 'update'
        ? actionRaw
        : null;
    if (!action) {
      return {
        status: 400,
        body: { success: false, message: 'action must be remove, update, or reset' },
      };
    }

    const company = await getCompanySettings().catch(() => null);
    const result = await updateStaffFulfillmentRoute({
      requestId: String(body.requestId ?? body.id ?? ''),
      supplierClientId: stockOwner.id,
      action,
      fromAddress: body.fromAddress != null ? String(body.fromAddress) : null,
      toAddress: body.toAddress != null ? String(body.toAddress) : null,
      defaultOriginAddress: company?.companyAddress?.trim() || null,
      allowStaffOverride: true,
    });

    return {
      status: 200,
      body: {
        success: true,
        message:
          action === 'remove'
            ? 'Route removed from card'
            : action === 'reset'
              ? 'Route reset to defaults'
              : 'Route recalculated',
        fulfillmentRoute: result.fulfillmentRoute,
        routeEditor: result.routeEditor,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update route';
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
