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

import { emitMiniCdEvent } from '@web/lib/mini-cd-events.server';
import { processOrderShipmentUpdate } from '@web/lib/order-email-monitoring-run';
import { createOrderNotPreAlertedNotice } from '@web/lib/order-notices';
import { deleteOrder, getOrderById, updateOrder } from '@web/lib/orders';
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


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const order = await getOrderById(id, { includeCost: session.role === 'admin' });
    if (!order) {
      return { status: 404, body: { success: false, message: 'Order not found' } };
    }

    return { status: 200, body: { success: true, order } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    const result = await updateOrder(id, body);
    if (!result?.order) {
      return { status: 404, body: { success: false, message: 'Order not found' } };
    }

    const { previous, order } = result;
    const clientName = order.client?.name ?? 'Unknown client';

    let notifyClient = false;
    let explicitEmail = false;
    if (body.sendEmail === true) {
      notifyClient = true;
      explicitEmail = true;
    } else if (body.sendEmail !== false) {
      const statusChanged = order.status !== previous.status;
      const locationChanged =
        order.shippingStage !== previous.shippingStage ||
        (order.currentLocation ?? '') !== (previous.currentLocation ?? '');
      notifyClient =
        (statusChanged && ['shipped', 'delivered', 'cancelled'].includes(order.status)) ||
        (locationChanged && order.shippingStage === 'local_office');
    }

    await processOrderShipmentUpdate(previous, order, {
      origin: getRequestPublicOriginFromCtx(ctx),
      notifyClient,
      explicitEmail,
    });

    if (body.isLoggedInPreAlerts === false && previous.isLoggedInPreAlerts) {
      createOrderNotPreAlertedNotice({
        orderNumber: order.orderNumber,
        title: order.title,
        itemName: order.itemName,
        clientName,
        createdBy: session.username ?? 'Admin',
        costPrice: String((order as { costPrice?: number }).costPrice ?? 0),
      }).catch(console.error);
    }

    const trackingChanged =
      (order.trackingNumber ?? '') !== (previous.trackingNumber ?? '') && Boolean(order.trackingNumber);
    const statusChanged = order.status !== previous.status;
    let eventType = 'order.updated';
    if (trackingChanged) eventType = 'order.tracking_set';
    else if (statusChanged && order.status === 'shipped') eventType = 'order.shipped';
    else if (statusChanged && order.status === 'delivered') eventType = 'order.delivered';

    emitMiniCdEvent(session, {
      type: eventType,
      summary: trackingChanged
        ? `Set tracking ${order.trackingNumber} on order ${order.orderNumber} for ${clientName}`
        : statusChanged
          ? `Order ${order.orderNumber} status changed to ${order.status}`
          : `Updated order ${order.orderNumber} for ${clientName}`,
      entityType: 'order',
      entityId: order.id,
      href: `/orders/${order.id}`,
      clientId: order.clientId ?? undefined,
      clientName,
      actorName: session.username ?? 'Admin',
      metadata: trackingChanged
        ? { trackingNumber: order.trackingNumber ?? null }
        : statusChanged
          ? { fromStatus: previous.status, toStatus: order.status }
          : undefined,
    });

    return { status: 200, body: { success: true, message: 'Order updated', order } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update order';
    return { status: 500, body: { success: false, message } };
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const deleted = await deleteOrder(id);
    if (!deleted) {
      return { status: 404, body: { success: false, message: 'Order not found' } };
    }

    return { status: 200, body: { success: true, message: 'Order deleted' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

