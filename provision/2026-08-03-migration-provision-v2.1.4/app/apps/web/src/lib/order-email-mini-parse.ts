import { isMiniDockConfigured, miniProxyRequest } from '@/lib/mini-dock';
import type { ShippingStage } from '@/lib/order-shipment-stages';
import { SHIPPING_STAGES } from '@/lib/order-constants';

export type MiniShipmentEmailParseResult = {
  shippingStage: ShippingStage;
  currentLocation: string;
  status: 'ordered' | 'shipped' | 'delivered';
  confidence: number;
  reason: string;
  source: 'mini';
};

type MiniParseResponse = {
  ok?: boolean;
  shippingStage?: string;
  currentLocation?: string;
  status?: string;
  confidence?: number;
  reason?: string;
  skipped?: boolean;
  error?: string;
};

function normalizeStage(value: string | undefined): ShippingStage | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return SHIPPING_STAGES.includes(normalized as ShippingStage) ? (normalized as ShippingStage) : null;
}

export async function parseShipmentEmailWithMini(input: {
  subject: string;
  from: string;
  text: string;
  currentStage: string;
  vendor?: string | null;
  orderNumber?: string | null;
  vendorOrderNumber?: string | null;
}): Promise<MiniShipmentEmailParseResult | null> {
  if (!(await isMiniDockConfigured())) return null;

  const snippet = `${input.subject}\n\n${input.text}`.trim().slice(0, 1400);
  const result = await miniProxyRequest(
    '/api/cd/parse-shipment-email',
    {
      method: 'POST',
      body: JSON.stringify({
        subject: input.subject.slice(0, 240),
        from: input.from.slice(0, 160),
        text: snippet,
        current_stage: input.currentStage,
        vendor: input.vendor ?? null,
        order_number: input.orderNumber ?? null,
        vendor_order_number: input.vendorOrderNumber ?? null,
      }),
    },
    { timeoutMs: 12_000, updateOnlineCache: false }
  );

  if (!result.ok || !result.body || typeof result.body !== 'object') return null;
  const body = result.body as MiniParseResponse;
  if (body.skipped || body.error) return null;

  const stage = normalizeStage(body.shippingStage);
  if (!stage) return null;

  const status =
    body.status === 'delivered' || body.status === 'ordered' || body.status === 'shipped'
      ? body.status
      : stage === 'delivered'
        ? 'delivered'
        : stage === 'ordered'
          ? 'ordered'
          : 'shipped';

  return {
    shippingStage: stage,
    currentLocation: (body.currentLocation || '').trim() || stage,
    status,
    confidence: Math.max(0, Math.min(1, Number(body.confidence) || 0.5)),
    reason: (body.reason || '').trim().slice(0, 240),
    source: 'mini',
  };
}
