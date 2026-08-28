import {
  DEFAULT_OFFICE_LOCATION,
  SHIPPING_STAGE_LABELS,
  SHIPPING_STAGES,
} from '@/lib/order-constants';

export type ShippingStage = (typeof SHIPPING_STAGES)[number];

export function shippingStageIndex(stage: string): number {
  const idx = SHIPPING_STAGES.indexOf(stage as ShippingStage);
  return idx >= 0 ? idx : 0;
}

export function shippingStageLabel(stage: string): string {
  return SHIPPING_STAGE_LABELS[stage] ?? stage;
}

export function locationForShippingStage(stage: string, vendor?: string | null): string {
  switch (stage) {
    case 'ordered':
      return 'Order placed';
    case 'manufacturer_shipped':
      return vendor ? `Shipped from ${vendor}` : 'Shipped from manufacturer';
    case 'miami_warehouse':
      return 'Miami Warehouse';
    case 'in_transit':
      return 'In Transit to Trinidad';
    case 'customs':
      return 'In Customs';
    case 'local_office':
      return DEFAULT_OFFICE_LOCATION;
    case 'out_for_delivery':
      return 'Out for Delivery';
    case 'delivered':
      return 'Delivered';
    default:
      return 'Updated';
  }
}

export function statusForShippingStage(stage: string): 'ordered' | 'shipped' | 'delivered' {
  if (stage === 'delivered') return 'delivered';
  if (stage === 'ordered') return 'ordered';
  return 'shipped';
}

/** US vendor domestic tracking often uses phrases that are not Trinidad journey stages. */
export function isAmbiguousShipmentEmailPhrase(
  subject: string,
  text: string,
  vendor?: string | null
): boolean {
  const body = `${subject}\n${text}`.toLowerCase();
  const vendorLower = (vendor ?? '').toLowerCase();
  const usVendor = /amazon|ebay|walmart|best buy|newegg|target/.test(vendorLower) || /amazon\.com|ebay\.com/i.test(body);

  if (/out for delivery/i.test(body) && usVendor) return true;
  if (/\b(was delivered|has been delivered|package delivered)\b/i.test(body) && usVendor) return true;
  if (/arrived at destination/i.test(body) && !/trinidad|jetbox|malabar|arima|customs/i.test(body)) return true;
  return false;
}

export function shouldAskMiniForShipmentStage(options: {
  currentStage: string;
  proposedStage: string;
  subject: string;
  text: string;
  vendor?: string | null;
}): boolean {
  const currentIdx = shippingStageIndex(options.currentStage);
  const proposedIdx = shippingStageIndex(options.proposedStage);
  if (proposedIdx <= currentIdx) return false;
  if (proposedIdx > currentIdx + 1) return true;
  return isAmbiguousShipmentEmailPhrase(options.subject, options.text, options.vendor);
}

/**
 * Email updates normally advance one stage at a time.
 * Mini may approve up to +2 when confidence is high (still blocks huge jumps).
 */
export function clampEmailShippingStage(
  currentStage: string,
  proposedStage: string,
  options?: { miniApproved?: boolean; miniConfidence?: number }
): { stage: string; guarded: boolean } {
  const currentIdx = shippingStageIndex(currentStage);
  const proposedIdx = shippingStageIndex(proposedStage);
  if (proposedIdx <= currentIdx) {
    return { stage: currentStage, guarded: proposedIdx < currentIdx };
  }

  const maxAdvance = options?.miniApproved && (options.miniConfidence ?? 0) >= 0.75 ? 2 : 1;
  const cappedIdx = Math.min(proposedIdx, currentIdx + maxAdvance);
  return {
    stage: SHIPPING_STAGES[cappedIdx] ?? currentStage,
    guarded: cappedIdx !== proposedIdx,
  };
}

export function describeShipmentJourneyForContext(): string {
  return SHIPPING_STAGES.map((stage, index) => `${index + 1}. ${stage} — ${SHIPPING_STAGE_LABELS[stage]}`).join(
    '\n'
  );
}
