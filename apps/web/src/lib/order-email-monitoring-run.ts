import { createOrderArrivedNotice, createOrderStatusUpdateNotice } from '@/lib/order-notices';
import {
  notifyOrderArrived,
  notifyOrderLocationChange,
  notifyOrderStatusChange,
} from '@/lib/order-notifications';
import { runEmailMonitoringCheck } from '@/lib/order-email-monitoring';
import { emitMiniCdEvents } from '@/lib/mini-cd-events.server';
import { shippingStageLabel } from '@/lib/order-shipment-stages';
import type { SerializedOrder } from '@/lib/orders';

async function notifyMiniOfShipmentUpdate(
  previous: SerializedOrder,
  order: SerializedOrder,
  meta?: { miniAssisted?: boolean; stageGuarded?: boolean; emailSubject?: string }
) {
  const stageChanged = order.shippingStage !== previous.shippingStage;
  const locationChanged = (order.currentLocation ?? '') !== (previous.currentLocation ?? '');
  if (!stageChanged && !locationChanged && order.status === previous.status) return;

  const fromLabel = shippingStageLabel(previous.shippingStage);
  const toLabel = shippingStageLabel(order.shippingStage);
  const bits = [
    `Order ${order.orderNumber} (${order.itemName})`,
    stageChanged ? `${fromLabel} -> ${toLabel}` : `still ${toLabel}`,
  ];
  if (order.currentLocation) bits.push(order.currentLocation);
  if (meta?.miniAssisted) bits.push('Mini assisted');
  if (meta?.stageGuarded) bits.push('stage guard applied');
  if (meta?.emailSubject) bits.push(`from email "${meta.emailSubject.slice(0, 80)}"`);

  await emitMiniCdEvents([
    {
      type: stageChanged ? 'order.shipment_stage' : 'order.updated',
      summary: bits.join(' — '),
      entityType: 'order',
      entityId: order.id,
      href: `/orders/${order.id}`,
      clientId: order.clientId,
      clientName: order.client?.name ?? undefined,
      metadata: {
        previousStage: previous.shippingStage,
        shippingStage: order.shippingStage,
        currentLocation: order.currentLocation ?? null,
        miniAssisted: Boolean(meta?.miniAssisted),
        stageGuarded: Boolean(meta?.stageGuarded),
      },
    },
  ]);
}

export async function processOrderShipmentUpdate(
  previous: SerializedOrder,
  order: SerializedOrder,
  options?: { origin?: string; notifyClient?: boolean; explicitEmail?: boolean }
) {
  const clientName = order.client?.name ?? 'Unknown client';
  const origin = options?.origin;
  const shouldNotify = options?.notifyClient !== false && options?.notifyClient !== undefined
    ? options.notifyClient
    : options?.explicitEmail;

  if (order.status !== previous.status) {
    createOrderStatusUpdateNotice({
      orderNumber: order.orderNumber,
      title: order.title,
      status: order.status,
      previousStatus: previous.status,
      clientName,
    }).catch(console.error);

    if (shouldNotify || options?.explicitEmail) {
      notifyOrderStatusChange(order, previous.status, {
        origin,
        sendEmail: options?.explicitEmail === true,
      }).catch(console.error);
    }
  }

  const locationChanged =
    order.shippingStage !== previous.shippingStage ||
    (order.currentLocation ?? '') !== (previous.currentLocation ?? '');

  if (locationChanged && order.status === previous.status) {
    if (shouldNotify || options?.explicitEmail) {
      if (order.shippingStage !== 'local_office') {
        notifyOrderLocationChange(order, previous, {
          origin,
          force: !options?.explicitEmail || options.explicitEmail,
        }).catch(console.error);
      }
    }
  }

  if (order.shippingStage === 'local_office' && previous.shippingStage !== 'local_office') {
    createOrderArrivedNotice({
      orderNumber: order.orderNumber,
      title: order.title,
      itemName: order.itemName,
      clientName,
    }).catch(console.error);
    if (options?.notifyClient) {
      notifyOrderArrived(order, { origin }).catch(console.error);
    }
  } else if (order.actualArrival && !previous.actualArrival && order.shippingStage !== 'local_office') {
    createOrderArrivedNotice({
      orderNumber: order.orderNumber,
      title: order.title,
      itemName: order.itemName,
      clientName,
    }).catch(console.error);
    if (options?.notifyClient) {
      notifyOrderArrived(order, { origin }).catch(console.error);
    }
  }
}

export async function runEmailMonitoringCheckWithNotifications(origin?: string) {
  const result = await runEmailMonitoringCheck();
  if (!result.success || !result.updates?.length) {
    return result;
  }

  for (const entry of result.updates) {
    const { previous, order, meta } = entry;
    await processOrderShipmentUpdate(previous, order, { origin, notifyClient: true });
    await notifyMiniOfShipmentUpdate(previous, order, meta);
  }

  return result;
}
