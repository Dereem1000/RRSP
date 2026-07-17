// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { processOrderShipmentUpdate } from '@web/lib/order-email-monitoring-run';
import { markOrderReceivedAtOffice } from '@web/lib/orders';
import { getClientEmailPolicy } from '@web/lib/settings';
import { getRequestPublicOriginFromCtx } from '../../http-helpers';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const serialNumber = typeof body.serialNumber === 'string' ? body.serialNumber.trim() : '';

    let sendEmail = body.sendEmail === true;
    if (body.sendEmail === undefined) {
      const policy = await getClientEmailPolicy();
      sendEmail = !policy.confirmBeforeClientEmail;
    }

    const result = await markOrderReceivedAtOffice(id, {
      serialNumber: serialNumber || undefined,
      sendEmail,
      origin: getRequestPublicOriginFromCtx(ctx),
    });

    if (!result?.order || !result.previous) {
      return { status: 404, body: { success: false, message: 'Order not found' } };
    }

    await processOrderShipmentUpdate(result.previous, result.order, {
      origin: getRequestPublicOriginFromCtx(ctx),
      notifyClient: sendEmail,
      explicitEmail: sendEmail,
    });

    return { status: 200, body: {
      success: true,
      message: 'Shipment marked as received at office',
      order: result.order,
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to mark order received';
    return { status: 500, body: { success: false, message } };
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

