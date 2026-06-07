import { User } from '@cd-v2/database';
import { getClientEmailPolicy } from '@/lib/settings';
import type { OrderEmailPayload, OrderEmailType } from '@/lib/order-email';
import { buildOrderEmailHtml, sendOrderEmailToClient, sendOrderEmailToStaff } from '@/lib/order-email';

type OrderLike = OrderEmailPayload & {
  client?: { name?: string; email?: string };
};

function toPayload(order: OrderLike): OrderEmailPayload {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    title: order.title,
    itemName: order.itemName,
    status: order.status,
    shippingStage: order.shippingStage,
    vendor: order.vendor,
    vendorOrderNumber: order.vendorOrderNumber,
    trackingNumber: order.trackingNumber,
    orderDate: order.orderDate,
    estimatedArrival: order.estimatedArrival,
    actualArrival: order.actualArrival,
    clientPrice: order.clientPrice,
    quantity: order.quantity,
    currentLocation: order.currentLocation,
    client: order.client,
  };
}

async function emailClientIfAllowed(
  order: OrderLike,
  type: OrderEmailType,
  options?: { origin?: string; previousStatus?: string; force?: boolean }
) {
  const email = order.client?.email;
  if (!email) return false;

  if (!options?.force) {
    const policy = await getClientEmailPolicy();
    if (policy.confirmBeforeClientEmail) return false;
  }

  return sendOrderEmailToClient(toPayload(order), email, {
    origin: options?.origin,
    type,
    previousStatus: options?.previousStatus,
  });
}

export async function notifyOrderCreated(
  order: OrderLike,
  options?: { origin?: string; sendEmail?: boolean }
) {
  if (!options?.sendEmail) return false;
  const email = order.client?.email;
  if (!email) return false;
  return sendOrderEmailToClient(toPayload(order), email, {
    origin: options?.origin,
    type: 'created',
  });
}

export async function notifyOrderStatusChange(
  order: OrderLike,
  previousStatus: string,
  options?: { origin?: string; sendEmail?: boolean }
) {
  if (!options?.sendEmail) {
    const autoNotify = ['shipped', 'delivered', 'cancelled'].includes(order.status);
    if (!autoNotify) return false;
    return emailClientIfAllowed(
      order,
      order.status === 'delivered' ? 'delivered' : order.status === 'cancelled' ? 'cancelled' : 'status_update',
      { origin: options?.origin, previousStatus, force: true }
    );
  }

  const email = order.client?.email;
  if (!email) return false;

  const type: OrderEmailType =
    order.status === 'delivered'
      ? 'delivered'
      : order.status === 'cancelled'
        ? 'cancelled'
        : 'status_update';

  return sendOrderEmailToClient(toPayload(order), email, {
    origin: options?.origin,
    type,
    previousStatus,
  });
}

export async function notifyOrderArrived(order: OrderLike, options?: { origin?: string }) {
  return emailClientIfAllowed(order, 'arrived', { origin: options?.origin, force: true });
}

export async function notifyOrderPreAlert(order: OrderLike, options?: { origin?: string }) {
  const admins = await User.findAll({
    where: { role: 'admin', isActive: true },
    attributes: ['email', 'username', 'firstName', 'lastName'],
    limit: 10,
  });

  const payload = toPayload(order);
  let sent = 0;

  for (const admin of admins) {
    if (!admin.email) continue;
    const name = [admin.firstName, admin.lastName].filter(Boolean).join(' ') || admin.username || 'Admin';
    const ok = await sendOrderEmailToStaff(payload, admin.email, {
      origin: options?.origin,
      type: 'pre_alert',
      recipientName: name,
    });
    if (ok) sent += 1;
  }

  return sent;
}

export type OrderEmailTemplate =
  | 'created'
  | 'status_update'
  | 'shipped'
  | 'arrived'
  | 'delivered'
  | 'cancelled'
  | 'pre_alert';

export async function buildOrderEmailPreview(
  template: OrderEmailTemplate,
  options?: { origin?: string; test?: boolean }
) {
  const sample: OrderEmailPayload = {
    id: 'test-order-preview',
    orderNumber: 'ORD-2026-001',
    title: 'Replacement laptop battery',
    itemName: 'Dell Latitude 5520 battery',
    status:
      template === 'delivered'
        ? 'delivered'
        : template === 'cancelled'
          ? 'cancelled'
          : template === 'shipped'
            ? 'shipped'
            : 'ordered',
    shippingStage:
      template === 'shipped' ? 'in_transit' : template === 'delivered' ? 'delivered' : 'ordered',
    trackingNumber: '1Z999AA10123456784',
    orderDate: new Date().toISOString(),
    estimatedArrival: new Date(Date.now() + 10 * 86400000).toISOString(),
    actualArrival: template === 'arrived' || template === 'delivered' ? new Date().toISOString() : null,
    clientPrice: 850,
    quantity: 1,
    currentLocation: template === 'shipped' ? 'In transit to Trinidad' : 'Malabar, Arima',
    client: { name: 'Sample Client Ltd.', email: 'client@example.com' },
  };

  const type: OrderEmailType =
    template === 'shipped' ? 'status_update' : template === 'pre_alert' ? 'pre_alert' : template;

  if (template === 'pre_alert') {
    return buildOrderEmailHtml(sample, {
      origin: options?.origin,
      type: 'pre_alert',
      recipientName: 'Admin User',
      test: options?.test,
    });
  }

  return buildOrderEmailHtml(sample, {
    origin: options?.origin,
    type,
    previousStatus: template === 'status_update' || template === 'shipped' ? 'ordered' : undefined,
    test: options?.test,
  });
}
