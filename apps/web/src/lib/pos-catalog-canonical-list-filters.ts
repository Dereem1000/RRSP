export type CanonicalListSort = 'activity' | 'recent' | 'stores' | 'name';

export type CanonicalListFilter =
  | 'all'
  | 'federated'
  | 'pending'
  | 'override'
  | 'has_image'
  | 'no_image'
  | 'baseline'
  | 'draft'
  | 'new'
  | 'archived';

export type CanonicalListFilterSettings = {
  sort: CanonicalListSort;
  filter: CanonicalListFilter;
  limit: number;
};

export const DEFAULT_CANONICAL_LIST_FILTERS: CanonicalListFilterSettings = {
  sort: 'name',
  filter: 'all',
  limit: 200,
};

const STORAGE_KEY = 'cd-canonical-catalog-filters';

export function loadCanonicalListFilters(): CanonicalListFilterSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_CANONICAL_LIST_FILTERS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CANONICAL_LIST_FILTERS };
    const parsed = JSON.parse(raw) as Partial<CanonicalListFilterSettings>;
    return {
      sort: (parsed.sort as CanonicalListSort) || DEFAULT_CANONICAL_LIST_FILTERS.sort,
      filter: (parsed.filter as CanonicalListFilter) || DEFAULT_CANONICAL_LIST_FILTERS.filter,
      limit: Number(parsed.limit) || DEFAULT_CANONICAL_LIST_FILTERS.limit,
    };
  } catch {
    return { ...DEFAULT_CANONICAL_LIST_FILTERS };
  }
}

export function saveCanonicalListFilters(settings: CanonicalListFilterSettings) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Same token rules as Mini `list_canonical` (all tokens must appear in key/name/barcode/id). */
export function matchesCanonicalSearchQuery(
  item: {
    catalog_key?: string;
    name?: string;
    barcode?: string;
    mini_catalog_id?: string;
    category?: string;
    supplier?: string;
  },
  searchQuery: string,
): boolean {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    item.catalog_key,
    item.name,
    item.barcode,
    item.mini_catalog_id,
    item.category,
    item.supplier,
  ]
    .map((part) => String(part || ''))
    .join(' ')
    .toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => hay.includes(token));
}

const FILTERS_KEPT_DURING_SEARCH = new Set<CanonicalListFilter>(['draft', 'new', 'archived']);

export function buildCanonicalListQuery(
  settings: CanonicalListFilterSettings,
  searchQuery: string,
  offset = 0,
): string {
  const params = new URLSearchParams();
  const q = searchQuery.trim();
  if (q) params.set('q', q);
  params.set('sort', settings.sort);
  // Text search scans the full catalog unless the view is inbox-style (draft / archived).
  const keepFilter = FILTERS_KEPT_DURING_SEARCH.has(settings.filter);
  params.set('filter', q && !keepFilter ? 'all' : settings.filter);
  // Return all matches in one response while searching (starter catalog ~1,717 rows).
  const limit = q ? Math.max(settings.limit, 2500) : settings.limit;
  params.set('limit', String(limit));
  if (offset > 0) params.set('offset', String(offset));
  return `pos-catalog/canonical?${params.toString()}`;
}

export function formatFederationLastSeen(iso: string | undefined | null): string {
  const raw = String(iso || '').trim();
  if (!raw) return 'never';
  const ts = Date.parse(raw);
  if (Number.isNaN(ts)) return raw.slice(0, 10);
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
