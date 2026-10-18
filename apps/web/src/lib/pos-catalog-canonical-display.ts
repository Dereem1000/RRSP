export type FieldConsensusStatus =
  | 'cd_override'
  | 'baseline'
  | 'synced'
  | 'pending'
  | 'split'
  | 'none'
  | 'advisory';

export type FieldConsensusMeta = {
  status?: FieldConsensusStatus;
  required?: number;
  best_count?: number;
  distinct_values?: number;
  candidates?: Array<{ value?: unknown; count?: number }>;
};

export type CanonicalConsensus = {
  barcode?: FieldConsensusMeta;
  image_url?: FieldConsensusMeta;
  price?: { status?: string; sample_count?: number; recommended_price?: unknown };
};

export type CanonicalFederationUsage = {
  push_count?: number;
  /** Accepted POS connections with catalog sharing turned on (fleet-wide). */
  sharing_store_count?: number;
  /** Stores that have reported signals for this catalog row. */
  contributing_store_count?: number;
  last_federated_at?: string | null;
};

export type CanonicalPublishStatus = 'published' | 'draft' | 'archived';

export type CanonicalCatalogItem = {
  catalog_key?: string;
  mini_catalog_id?: string;
  name?: string;
  barcode?: string;
  image_url?: string;
  category?: string;
  size?: string;
  supplier?: string;
  cost_price?: number;
  recommended_price?: number;
  price_sample_count?: number;
  barcode_consensus_count?: number;
  image_consensus_count?: number;
  updated_at?: string;
  source?: string;
  publish_status?: CanonicalPublishStatus;
  first_seen_connection_id?: string;
  first_seen_at?: string;
  published_at?: string;
  overrides?: Record<string, string | number>;
  federation?: CanonicalFederationUsage;
  consensus?: CanonicalConsensus;
};

export type CanonicalDetailSignals = Record<
  string,
  Record<string, { value?: unknown; updated_at?: string }>
>;

export function publishStatusLabel(status?: CanonicalPublishStatus | string): string {
  const key = String(status || 'published').toLowerCase();
  if (key === 'draft') return 'New — awaiting publish';
  if (key === 'archived') return 'Archived';
  return 'Published';
}

export function publishStatusTone(status?: CanonicalPublishStatus | string): string {
  const key = String(status || 'published').toLowerCase();
  if (key === 'draft') return 'bg-amber-100 text-amber-900';
  if (key === 'archived') return 'bg-slate-200 text-slate-700';
  return 'bg-emerald-100 text-emerald-800';
}

export { resolveCanonicalImageSrc, catalogImageUrlToCdServeUrl, parseCatalogImageFileName } from '@/lib/pos-catalog-image-url';

export function fieldStatusLabel(field: 'barcode' | 'image_url', meta?: FieldConsensusMeta): string {
  const status = meta?.status || 'none';
  const req = meta?.required ?? 0;
  const best = meta?.best_count ?? 0;
  const fieldLabel = field === 'image_url' ? 'Image' : 'Barcode';
  if (status === 'cd_override') return `${fieldLabel}: CD override (locked)`;
  if (status === 'baseline') return `${fieldLabel}: starter / baseline`;
  if (status === 'synced') return field === 'image_url' ? 'Image: synced from stores' : 'Barcode: synced from stores';
  if (status === 'split') return `${fieldLabel}: split vote (${best}/${req} max)`;
  if (status === 'pending') return `${fieldLabel}: consensus in progress (${best}/${req})`;
  if (status === 'none') return `${fieldLabel}: no store signals yet`;
  return `${fieldLabel}: ${status}`;
}

export function fieldStatusTone(meta?: FieldConsensusMeta): string {
  const status = meta?.status || 'none';
  if (status === 'cd_override') return 'bg-indigo-100 text-indigo-800';
  if (status === 'synced' || status === 'baseline') return 'bg-emerald-100 text-emerald-800';
  if (status === 'pending') return 'bg-amber-100 text-amber-900';
  if (status === 'split') return 'bg-orange-100 text-orange-900';
  return 'bg-slate-100 text-slate-700';
}
