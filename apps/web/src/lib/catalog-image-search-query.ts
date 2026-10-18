/**
 * POS Inventory image search query (`client/src/components/Inventory.js`):
 * `[formData.name, formData.brand, formData.size].filter(Boolean).join(' ').trim()`
 * Barcode is not included.
 */

export type PosStyleImageSearchFields = {
  name?: string | null;
  brand?: string | null;
  size?: string | null;
  /** Federation catalog has no brand field — supplier is used like brand when present. */
  supplier?: string | null;
};

function isBarcodeLikeToken(part: string): boolean {
  const trimmed = part.trim();
  if (!trimmed) return false;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 8) return false;
  const nonDigit = trimmed.replace(/\d/g, '').length;
  return nonDigit <= 2;
}

/** Drop UPC/EAN tokens if they were pasted into name or other fields. */
export function stripBarcodeTokensFromImageSearchQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter((part) => !isBarcodeLikeToken(part))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Same join order as POS Inventory online image search. */
export function buildPosStyleImageSearchQuery(fields: PosStyleImageSearchFields): string {
  const name = String(fields.name || '').trim();
  const brand = String(fields.brand || fields.supplier || '').trim();
  const size = String(fields.size || '').trim();
  const joined = [name, brand, size].filter(Boolean).join(' ').trim();
  return stripBarcodeTokensFromImageSearchQuery(joined);
}

/** @deprecated Prefer buildPosStyleImageSearchQuery with explicit fields. */
export function buildProductImageSearchQuery(parts: Array<string | null | undefined>): string {
  const joined = parts.map((p) => String(p || '').trim()).filter(Boolean).join(' ');
  return stripBarcodeTokensFromImageSearchQuery(joined);
}
