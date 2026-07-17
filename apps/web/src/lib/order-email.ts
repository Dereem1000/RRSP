import {
  escapeHtml,
  getEmailBrand,
  infoRow,
  infoTable,
  paragraph,
  primaryButton,
  renderEmailLayout,
  statusBadge,
} from '@/lib/email-templates';
import { sendEmail } from '@/lib/email';
import { buildPortalUrl } from '@/lib/site-url';
import {
  ORDER_STATUS_LABELS,
  SHIPPING_STAGE_LABELS,
  getTrackingUrl,
} from '@/lib/order-constants';

export type OrderEmailType =
  | 'created'
  | 'status_update'
  | 'location_update'
  | 'arrived'
  | 'delivered'
  | 'cancelled'
  | 'pre_alert';

export type OrderEmailPayload = {
  id: string;
  orderNumber: string;
  title: string;
  itemName: string;
  status: string;
  shippingStage?: string;
  vendor?: string | null;
  vendorOrderNumber?: string | null;
  trackingNumber?: string | null;
  orderDate?: string;
  estimatedArrival?: string | null;
  actualArrival?: string | null;
  clientPrice?: number;
  quantity?: number;
  currentLocation?: string | null;
  serialNumber?: string | null;
  client?: { name?: string; email?: string };
};

function formatMoney(amount: number) {
  return `TTD ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set';
  return new Date(value).toLocaleDateString();
}

function statusLabel(status: string) {
  return ORDER_STATUS_LABELS[status] ?? status;
}

function stageLabel(stage?: string) {
  if (!stage) return 'Not set';
  return SHIPPING_STAGE_LABELS[stage] ?? stage;
}

function actionText(type: OrderEmailType, order: OrderEmailPayload, previousStatus?: string) {
  switch (type) {
    case 'created':
      return `We have placed an order for <strong>${escapeHtml(order.itemName)}</strong>. We will keep you updated as it moves through shipping.`;
    case 'status_update':
      return previousStatus
        ? `Your order status changed from <strong>${escapeHtml(statusLabel(previousStatus))}</strong> to <strong>${escapeHtml(statusLabel(order.status))}</strong>.`
        : `Your order status has been updated to <strong>${escapeHtml(statusLabel(order.status))}</strong>.`;
    case 'location_update':
      return `Your shipment update: <strong>${escapeHtml(stageLabel(order.shippingStage))}</strong>${order.currentLocation ? ` — ${escapeHtml(order.currentLocation)}` : ''}.`;
    case 'arrived':
      return `Good news! Your order for <strong>${escapeHtml(order.itemName)}</strong> has arrived and is ready for the next step.`;
    case 'delivered':
      return `Your order for <strong>${escapeHtml(order.itemName)}</strong> has been marked as delivered.`;
    case 'cancelled':
      return `Your order for <strong>${escapeHtml(order.itemName)}</strong> has been cancelled. Contact us if you have any questions.`;
    case 'pre_alert':
      return `Order <strong>#${escapeHtml(order.orderNumber)}</strong> has not been logged in pre-alerts yet. Please complete pre-alert registration for proper tracking and compliance.`;
  }
}

function statusColor(type: OrderEmailType) {
  switch (type) {
    case 'delivered':
    case 'arrived':
      return '#16a34a';
    case 'cancelled':
      return '#64748b';
    case 'pre_alert':
      return '#d97706';
    default:
      return '#4f46e5';
  }
}

function orderRows(order: OrderEmailPayload, type: OrderEmailType) {
  const rows = [
    infoRow('Order', `<strong>#${escapeHtml(order.orderNumber)}</strong>`),
    infoRow('Item', escapeHtml(order.itemName)),
    infoRow('Title', escapeHtml(order.title)),
    infoRow('Status', statusBadge(statusLabel(order.status), statusColor(type))),
  ];

  if (order.shippingStage) {
    rows.push(infoRow('Shipping stage', escapeHtml(stageLabel(order.shippingStage))));
  }
  if (order.currentLocation) {
    rows.push(infoRow('Location', escapeHtml(order.currentLocation)));
  }
  if (order.trackingNumber) {
    rows.push(infoRow('Tracking #', escapeHtml(order.trackingNumber)));
  }
  if (order.serialNumber) {
    rows.push(infoRow('Serial #', escapeHtml(order.serialNumber)));
  }
  if (order.estimatedArrival) {
    rows.push(infoRow('Estimated arrival', escapeHtml(formatDate(order.estimatedArrival))));
  }
  if (order.actualArrival) {
    rows.push(infoRow('Arrived on', escapeHtml(formatDate(order.actualArrival))));
  }
  if (order.clientPrice != null) {
    rows.push(infoRow('Price', escapeHtml(formatMoney(Number(order.clientPrice)))));
  }
  if (order.quantity && order.quantity > 1) {
    rows.push(infoRow('Quantity', escapeHtml(String(order.quantity))));
  }

  return rows;
}

export async function buildOrderEmailHtml(
  order: OrderEmailPayload,
  options?: {
    origin?: string;
    type?: OrderEmailType;
    previousStatus?: string;
    recipientName?: string;
    test?: boolean;
  }
) {
  const brand = await getEmailBrand();
  const type = options?.type ?? 'created';
  const portalUrl = (await buildPortalUrl(options?.origin)).replace(/\/login$/, '/orders');
  const trackingUrl = getTrackingUrl(order.trackingNumber, order.vendor);
  const clientName = escapeHtml(order.client?.name || options?.recipientName || 'Valued Client');

  const intro =
    type === 'pre_alert'
      ? paragraph(`Hello ${escapeHtml(options?.recipientName || 'Team')},`)
      : paragraph(`Dear ${clientName},`);

  const bodyParts = [
    intro,
    paragraph(actionText(type, order, options?.previousStatus)),
    infoTable(orderRows(order, type).join('')),
  ];

  if (type !== 'pre_alert') {
    bodyParts.push(primaryButton('View your orders', portalUrl));
  }

  if (trackingUrl && type !== 'pre_alert' && type !== 'cancelled') {
    bodyParts.push(
      paragraph(
        `<a href="${escapeHtml(trackingUrl)}" style="color:#4f46e5;font-weight:600;">Track shipment</a>`
      )
    );
  }

  const subjectMap: Record<OrderEmailType, string> = {
    created: `Order #${order.orderNumber} placed — ${order.itemName}`,
    status_update: `Order #${order.orderNumber} update — ${statusLabel(order.status)}`,
    location_update: `Order #${order.orderNumber} shipment update — ${stageLabel(order.shippingStage)}`,
    arrived: `Order #${order.orderNumber} has arrived`,
    delivered: `Order #${order.orderNumber} delivered`,
    cancelled: `Order #${order.orderNumber} cancelled`,
    pre_alert: `Pre-alert required — Order #${order.orderNumber}`,
  };

  const titleMap: Record<OrderEmailType, string> = {
    created: 'Order placed',
    status_update: 'Order status updated',
    location_update: 'Shipment location updated',
    arrived: 'Order arrived',
    delivered: 'Order delivered',
    cancelled: 'Order cancelled',
    pre_alert: 'Pre-alert required',
  };

  const prefix = options?.test ? '[TEST] ' : '';
  const rendered = await renderEmailLayout({
    brand,
    origin: options?.origin,
    eyebrow: type === 'pre_alert' ? 'Staff alert' : 'Parts order',
    title: `${titleMap[type]} — #${order.orderNumber}`,
    preheader: subjectMap[type],
    bodyHtml: bodyParts.join(''),
  });

  return {
    subject: `${prefix}${subjectMap[type]}`,
    ...rendered,
  };
}

export async function sendOrderEmailToClient(
  order: OrderEmailPayload,
  clientEmail: string,
  options?: {
    origin?: string;
    type?: OrderEmailType;
    previousStatus?: string;
    test?: boolean;
  }
) {
  const { subject, html, attachments } = await buildOrderEmailHtml(order, {
    ...options,
    type: options?.type ?? 'created',
  });
  return sendEmail({ to: clientEmail, subject, html, attachments, log: { category: 'order' } });
}

export async function sendOrderEmailToStaff(
  order: OrderEmailPayload,
  staffEmail: string,
  options?: {
    origin?: string;
    type?: OrderEmailType;
    recipientName?: string;
    test?: boolean;
  }
) {
  const { subject, html, attachments } = await buildOrderEmailHtml(order, {
    ...options,
    type: options?.type ?? 'pre_alert',
  });
  return sendEmail({ to: staffEmail, subject, html, attachments, log: { category: 'order' } });
}
