/** Client-safe POS catalog types/helpers (no Node/DB imports). */

/** physical = stockable item; non_stock = item without qty; service = labour/fees. */
export type PosProductKind = 'physical' | 'non_stock' | 'service';

/** Top-level catalog category shown in filters. */
export type PosProductCategory = 'items' | 'services';

export const POS_PRODUCT_KINDS: PosProductKind[] = ['physical', 'non_stock', 'service'];

export const POS_PRODUCT_KIND_LABELS: Record<PosProductKind, string> = {
  physical: 'Stockable item',
  non_stock: 'Untracked item (no qty)',
  service: 'Service',
};

export const POS_PRODUCT_CATEGORY_LABELS: Record<PosProductCategory, string> = {
  items: 'Items',
  services: 'Services',
};

export type PosProduct = {
  id: string;
  sku: string | null;
  name: string;
  description: string | null;
  unitPrice: number;
  costPrice: number;
  quantity: number;
  availableQuantity: number;
  kind: PosProductKind;
  /** POS catalog rows, or Parts inventory listings included for sale. */
  source: 'cd' | 'shop' | 'parts';
};

export function normalizePosProductKind(value: unknown): PosProductKind {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'non_stock' || raw === 'non-stock' || raw === 'nostock') return 'non_stock';
  if (raw === 'service' || raw === 'services') return 'service';
  if (raw === 'item' || raw === 'items' || raw === 'physical' || raw === 'stockable') return 'physical';
  return 'physical';
}

export function tracksPosStock(kind: PosProductKind | undefined): boolean {
  return (kind ?? 'physical') === 'physical';
}

export function isPosItemKind(kind: PosProductKind | undefined): boolean {
  return (kind ?? 'physical') !== 'service';
}

export function posProductCategory(kind: PosProductKind | undefined): PosProductCategory {
  return isPosItemKind(kind) ? 'items' : 'services';
}

/** Filter: all | items (stockable + no-stock) | services. */
export function matchesPosCategoryFilter(
  kind: PosProductKind | undefined,
  filter: 'all' | PosProductCategory
): boolean {
  if (filter === 'all') return true;
  return posProductCategory(kind) === filter;
}

export function isPosProductSellable(
  product: Pick<PosProduct, 'kind' | 'source' | 'quantity' | 'availableQuantity'>
): boolean {
  if (!tracksPosStock(product.kind)) return true;
  return posSellableQuantity(product) > 0;
}

/**
 * Sellable units:
 * - Parts → marketplace Available
 * - POS catalog → on-hand Quantity (falls back to Available for legacy rows
 *   where counter stock was tracked only in availableQuantity)
 */
export function posSellableQuantity(
  product: Pick<PosProduct, 'kind' | 'source' | 'quantity' | 'availableQuantity'>
): number {
  if (!tracksPosStock(product.kind)) return Number.POSITIVE_INFINITY;
  if (product.source === 'parts') return Math.max(0, Number(product.availableQuantity) || 0);
  const quantity = Math.max(0, Number(product.quantity) || 0);
  const available = Math.max(0, Number(product.availableQuantity) || 0);
  return Math.max(quantity, available);
}
