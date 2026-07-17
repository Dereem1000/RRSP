export const ORDER_STATUSES = ['ordered', 'shipped', 'delivered', 'cancelled', 'returned'] as const;

/** Default label when a shipment is marked received at the office. */
export const DEFAULT_OFFICE_LOCATION = 'Computer Dynamics — Malabar, Arima';

export const SHIPPING_STAGES = [
  'ordered',
  'manufacturer_shipped',
  'miami_warehouse',
  'in_transit',
  'customs',
  'local_office',
  'out_for_delivery',
  'delivered',
] as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  ordered: 'Order placed',
  shipped: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

export const SHIPPING_STAGE_LABELS: Record<string, string> = {
  ordered: 'Order placed',
  manufacturer_shipped: 'Shipped from manufacturer',
  miami_warehouse: 'At Miami warehouse',
  in_transit: 'In transit to Trinidad',
  customs: 'In customs',
  local_office: 'At local office',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  ordered: 'bg-blue-50 text-blue-700',
  shipped: 'bg-amber-50 text-amber-800',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-slate-100 text-slate-600',
  returned: 'bg-violet-50 text-violet-700',
};

export const SHIPPING_STAGE_COLORS: Record<string, string> = {
  ordered: 'bg-slate-100 text-slate-600',
  manufacturer_shipped: 'bg-sky-50 text-sky-700',
  miami_warehouse: 'bg-indigo-50 text-indigo-700',
  in_transit: 'bg-amber-50 text-amber-800',
  customs: 'bg-orange-50 text-orange-800',
  local_office: 'bg-violet-50 text-violet-700',
  out_for_delivery: 'bg-blue-50 text-blue-700',
  delivered: 'bg-emerald-50 text-emerald-700',
};

export function getTrackingUrl(trackingNumber?: string | null, vendor?: string | null) {
  if (!trackingNumber) return null;

  const carriers: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(trackingNumber)}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(trackingNumber)}`,
    amazon: `https://www.amazon.com/progress-tracker/package/${encodeURIComponent(trackingNumber)}`,
    ebay: `https://www.ebay.com/sh/lst/active?tracking=${encodeURIComponent(trackingNumber)}`,
    jetbox: `https://www.jetboxtt.com/tracking/?tracking=${encodeURIComponent(trackingNumber)}`,
  };

  const vendorLower = (vendor ?? '').toLowerCase();
  const trackingLower = trackingNumber.toLowerCase();

  for (const [carrier, url] of Object.entries(carriers)) {
    if (vendorLower.includes(carrier)) return url;
  }

  if (trackingLower.startsWith('1z')) return carriers.ups;
  if (/^\d{12,22}$/.test(trackingNumber)) return carriers.fedex;

  return null;
}
