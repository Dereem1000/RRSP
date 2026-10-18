export const PARTS_LISTING_CATEGORIES = ['mobile_parts', 'laptop_parts', 'full_devices'] as const;

export type PartsListingCategory = (typeof PARTS_LISTING_CATEGORIES)[number];

export const PARTS_CATEGORY_LABELS: Record<PartsListingCategory, string> = {
  mobile_parts: 'Mobile parts',
  laptop_parts: 'Laptop parts',
  full_devices: 'Full devices',
};

export function normalizePartsCategory(value: unknown): PartsListingCategory {
  if (value === 'laptop_parts' || value === 'full_devices' || value === 'mobile_parts') {
    return value;
  }
  return 'mobile_parts';
}

export function categoryRequiresVideoVerification(category: PartsListingCategory): boolean {
  return category === 'full_devices';
}

export const PARTS_ITEM_CONDITIONS = ['new', 'used'] as const;

export type PartsItemCondition = (typeof PARTS_ITEM_CONDITIONS)[number];

export const PARTS_CONDITION_LABELS: Record<PartsItemCondition, string> = {
  new: 'New',
  used: 'Used',
};

export const MAX_PARTS_LISTING_IMAGES = 8;

export function normalizeItemCondition(value: unknown): PartsItemCondition {
  return value === 'used' ? 'used' : 'new';
}

export function parseListingImageFilesJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const entry of parsed) {
      const name = String(entry ?? '').trim();
      if (name && !out.includes(name)) out.push(name);
    }
    return out.slice(0, MAX_PARTS_LISTING_IMAGES);
  } catch {
    return [];
  }
}

export function serializeListingImageFiles(files: string[]): string | null {
  const unique = files
    .map((f) => String(f ?? '').trim())
    .filter(Boolean)
    .filter((f, i, arr) => arr.indexOf(f) === i)
    .slice(0, MAX_PARTS_LISTING_IMAGES);
  return unique.length ? JSON.stringify(unique) : null;
}

export function listingImageFilesFromRow(
  imageFilesJson: string | null | undefined,
  legacyImageFile: string | null | undefined
): string[] {
  const fromJson = parseListingImageFilesJson(imageFilesJson);
  if (fromJson.length) return fromJson;
  const legacy = String(legacyImageFile ?? '').trim();
  return legacy ? [legacy] : [];
}

export function partsCatalogMediaUrl(
  fileName: string | null | undefined,
  kind: 'image' | 'video'
): string | null {
  const safe = String(fileName ?? '').trim();
  if (!safe) return null;
  return `/api/parts-catalog-media/file/${encodeURIComponent(safe)}?kind=${kind}`;
}

export type PartsRequestVerificationStatus =
  | 'none'
  | 'pending_review'
  | 'awaiting_seller'
  | 'accepted'
  | 'denied'
  | 'skipped';

export function normalizeVerificationStatus(value: unknown): PartsRequestVerificationStatus {
  const raw = String(value ?? 'none');
  if (
    raw === 'pending_review' ||
    raw === 'awaiting_seller' ||
    raw === 'accepted' ||
    raw === 'denied' ||
    raw === 'skipped'
  ) {
    return raw;
  }
  return 'none';
}

export function fulfillmentVerificationClear(
  status: PartsRequestVerificationStatus | string | null | undefined
): boolean {
  const normalized = normalizeVerificationStatus(status);
  return normalized === 'none' || normalized === 'accepted' || normalized === 'skipped';
}

export const VERIFICATION_STATUS_LABELS: Record<PartsRequestVerificationStatus, string> = {
  none: 'No verification',
  pending_review: 'Pending CD review',
  awaiting_seller: 'Awaiting seller video',
  accepted: 'Verification accepted',
  denied: 'Verification denied',
  skipped: 'Verification skipped',
};
