'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { useCanonicalCatalogList } from '@/components/mini/catalog-library/useCanonicalCatalogList';
import {
  CanonicalCatalogItem,
  CanonicalDetailSignals,
  fieldStatusLabel,
  fieldStatusTone,
  publishStatusLabel,
  publishStatusTone,
  resolveCanonicalImageSrc,
} from '@/lib/pos-catalog-canonical-display';
import {
  formatFederationLastSeen,
  loadCanonicalListFilters,
  matchesCanonicalSearchQuery,
  saveCanonicalListFilters,
  type CanonicalListFilter,
  type CanonicalListFilterSettings,
  type CanonicalListSort,
} from '@/lib/pos-catalog-canonical-list-filters';
import { miniLibraryFetch, miniLibraryPost } from '@/lib/mini-library-client';
import { FederationCatalogImageField } from '@/components/mini/catalog-library/FederationCatalogImageField';

type PageTab = 'catalog' | 'draft' | 'duplicates' | 'categories';

type DuplicateGroup = {
  kind?: string;
  label?: string;
  name?: string;
  size?: string;
  barcode?: string;
  catalog_keys?: string[];
  items?: CanonicalCatalogItem[];
};

type CategoryRow = { name?: string; count?: number };

/** Path segment for Mini canonical routes — encoding is handled in `buildMiniLibraryApiUrl`. */
function canonicalPathKey(key: string) {
  return String(key || '').trim();
}

export function FederationCatalogPageClient() {
  const [pageTab, setPageTab] = useState<PageTab>('catalog');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [listSettings, setListSettings] = useState<CanonicalListFilterSettings>(() => loadCanonicalListFilters());
  const [showListSettings, setShowListSettings] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selected, setSelected] = useState<CanonicalCatalogItem | null>(null);
  const [signals, setSignals] = useState<CanonicalDetailSignals | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [editName, setEditName] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editSize, setEditSize] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editCostPrice, setEditCostPrice] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState('');
  const [addBarcode, setAddBarcode] = useState('');

  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [dupLoading, setDupLoading] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [mergeSource, setMergeSource] = useState('');

  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [catLoading, setCatLoading] = useState(false);
  const [catFrom, setCatFrom] = useState('');
  const [catTo, setCatTo] = useState('');

  const effectiveListSettings = useMemo(() => {
    if (pageTab === 'draft') {
      return {
        ...listSettings,
        filter: 'draft' as CanonicalListFilter,
        limit: Math.max(listSettings.limit, 2500),
      };
    }
    return listSettings;
  }, [listSettings, pageTab]);

  const { listLoading, canonicalItems, matchedTotal, catalogTotal, hasMore, loadCanonical } =
    useCanonicalCatalogList(miniLibraryFetch, effectiveListSettings, debouncedQuery, refreshToken, setStatus);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(searchInput.trim()), 320);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  useEffect(() => {
    setSelected(null);
    setSignals(null);
  }, [pageTab]);

  const runAction = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setStatus('');
    try {
      await fn();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setBusy(false);
    }
  }, []);

  const bumpList = () => setRefreshToken((n) => n + 1);

  const loadDuplicates = useCallback(async () => {
    setDupLoading(true);
    try {
      const data = await miniLibraryFetch<{ groups?: DuplicateGroup[] }>('pos-catalog/duplicates?limit=80');
      setDuplicateGroups(data.groups || []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load duplicates');
    } finally {
      setDupLoading(false);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    try {
      const data = await miniLibraryFetch<{ categories?: CategoryRow[] }>('pos-catalog/categories');
      setCategories(data.categories || []);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setCatLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pageTab === 'duplicates') void loadDuplicates();
    if (pageTab === 'categories') void loadCategories();
  }, [pageTab, loadDuplicates, loadCategories, refreshToken]);

  const openDetail = (item: CanonicalCatalogItem) => {
    setSelected(item);
    setEditName(String(item.name || ''));
    setEditBarcode(String(item.barcode || ''));
    setEditImageUrl(String(item.image_url || ''));
    setEditSize(String(item.size || ''));
    setEditCategory(String(item.category || ''));
    setEditSupplier(String(item.supplier || ''));
    setEditCostPrice(item.cost_price != null ? String(item.cost_price) : '');
    const key = String(item.catalog_key || '');
    if (!key) return;
    setDetailLoading(true);
    void miniLibraryFetch<{ item?: CanonicalCatalogItem; signals?: CanonicalDetailSignals }>(
      `pos-catalog/canonical/${canonicalPathKey(key)}`,
    )
      .then((data) => {
        if (data.item) setSelected(data.item);
        setSignals(data.signals || null);
      })
      .catch((err) => setStatus(err instanceof Error ? err.message : 'Failed to load detail'))
      .finally(() => setDetailLoading(false));
  };

  const hasCdFieldOverride =
    selected?.consensus?.barcode?.status === 'cd_override' ||
    selected?.consensus?.image_url?.status === 'cd_override';

  const clearCdOverrides = () => {
    if (!selected?.catalog_key) return;
    const key = canonicalPathKey(selected.catalog_key);
    runAction(async () => {
      await miniLibraryPost(`pos-catalog/canonical/${key}/override`, {
        name: '',
        barcode: '',
        image_url: '',
        size: '',
        category: '',
        supplier: '',
        cost_price: '',
      });
      setStatus('CD overrides cleared — store consensus can apply again.');
      bumpList();
      openDetail({ ...selected, catalog_key: selected.catalog_key });
    });
  };

  const saveOverrides = () => {
    if (!selected?.catalog_key) return;
    const key = canonicalPathKey(selected.catalog_key);
    runAction(async () => {
      await miniLibraryPost(`pos-catalog/canonical/${key}/override`, {
        name: editName.trim(),
        barcode: editBarcode.trim(),
        image_url: editImageUrl.trim(),
        size: editSize.trim(),
        category: editCategory.trim(),
        supplier: editSupplier.trim(),
        cost_price: editCostPrice.trim() ? Number(editCostPrice) : '',
      });
      setStatus('Catalog item updated.');
      bumpList();
      openDetail({ ...selected, catalog_key: selected.catalog_key });
    });
  };

  const setPublish = (action: 'publish' | 'draft' | 'archive') => {
    const catalogKey = selected?.catalog_key;
    if (!catalogKey) return;
    runAction(async () => {
      await miniLibraryPost(`pos-catalog/canonical/${canonicalPathKey(catalogKey)}/publish`, { action });
      setStatus(action === 'publish' ? 'Published — hints will sync to POS.' : `Status set to ${action}.`);
      bumpList();
      const data = await miniLibraryFetch<{ item?: CanonicalCatalogItem }>(
        `pos-catalog/canonical/${canonicalPathKey(catalogKey)}`,
      );
      if (data.item) setSelected(data.item);
    });
  };

  const deleteItem = () => {
    const catalogKey = selected?.catalog_key;
    if (!catalogKey) return;
    if (!window.confirm('Delete this catalog item permanently?')) return;
    runAction(async () => {
      await miniLibraryPost(`pos-catalog/canonical/${canonicalPathKey(catalogKey)}/delete`, {});
      setStatus('Item deleted.');
      setSelected(null);
      bumpList();
    });
  };

  const createItem = () => {
    runAction(async () => {
      await miniLibraryPost('pos-catalog/canonical', {
        name: addName.trim(),
        barcode: addBarcode.trim(),
        publish_status: 'published',
      });
      setStatus('Product added to federation catalog.');
      setShowAdd(false);
      setAddName('');
      setAddBarcode('');
      bumpList();
    });
  };

  const runMerge = () => {
    if (!mergeTarget.trim() || !mergeSource.trim()) return;
    runAction(async () => {
      await miniLibraryPost('pos-catalog/canonical/merge', {
        target_key: mergeTarget.trim(),
        source_key: mergeSource.trim(),
      });
      setStatus('Duplicate records merged.');
      setMergeTarget('');
      setMergeSource('');
      await loadDuplicates();
      bumpList();
    });
  };

  const runCategoryMerge = () => {
    if (!catFrom.trim() || !catTo.trim()) return;
    runAction(async () => {
      await miniLibraryPost('pos-catalog/categories/merge', {
        from_name: catFrom.trim(),
        to_name: catTo.trim(),
      });
      setStatus('Categories merged.');
      setCatFrom('');
      setCatTo('');
      await loadCategories();
      bumpList();
    });
  };

  const imageSearchFields = useMemo(
    () => ({
      name: editName,
      size: editSize,
      supplier: editSupplier,
    }),
    [editName, editSize, editSupplier],
  );

  const visibleItems = useMemo(() => {
    let items = canonicalItems;
    if (pageTab === 'draft') {
      items = items.filter((item) => String(item.publish_status || 'published') === 'draft');
    }
    if (!debouncedQuery) return items;
    return items.filter((item) => matchesCanonicalSearchQuery(item, debouncedQuery));
  }, [canonicalItems, debouncedQuery, pageTab]);

  const listSummaryMatched =
    pageTab === 'draft' ? visibleItems.length : matchedTotal;

  const updateListSettings = (patch: Partial<CanonicalListFilterSettings>) => {
    setListSettings((prev) => {
      const next = { ...prev, ...patch };
      saveCanonicalListFilters(next);
      return next;
    });
  };

  const tabBtn = (id: PageTab, label: string) => (
    <button
      type="button"
      onClick={() => setPageTab(id)}
      className={`rounded-xl px-3 py-2 text-sm font-medium ${
        pageTab === id ? 'bg-violet-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/mini?tab=library"
            className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-violet-800 hover:text-violet-950"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Mini → Library
          </Link>
          <h1 className="text-2xl font-bold text-slate-900">Federation catalog</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Managed product master data for federated POS stores. New items from stores stay in draft until you publish;
            only published items are sent as shared hints.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => bumpList()}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 rounded-xl bg-violet-700 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Add product
          </button>
        </div>
      </div>

      {status && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-800">{status}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {tabBtn('catalog', 'All products')}
        {tabBtn('draft', 'New (draft)')}
        {tabBtn('duplicates', 'Duplicates')}
        {tabBtn('categories', 'Categories')}
      </div>

      {(pageTab === 'catalog' || pageTab === 'draft') && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search name, barcode, category…"
                className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </div>
            <button
              type="button"
              onClick={() => setShowListSettings((v) => !v)}
              className="inline-flex items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900"
            >
              <Settings2 className="h-4 w-4" />
              Filters
            </button>
          </div>
          {showListSettings && pageTab === 'catalog' && (
            <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
              <label className="block text-sm font-medium text-slate-700">
                Sort
                <select
                  value={listSettings.sort}
                  onChange={(e) => updateListSettings({ sort: e.target.value as CanonicalListSort })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="activity">Federation activity</option>
                  <option value="recent">Recently federated</option>
                  <option value="stores">Most sharing stores</option>
                  <option value="name">Name (A–Z)</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Show
                <select
                  value={listSettings.filter}
                  onChange={(e) => updateListSettings({ filter: e.target.value as CanonicalListFilter })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="all">All</option>
                  <option value="draft">New — awaiting publish</option>
                  <option value="federated">Federation active</option>
                  <option value="pending">Consensus in progress</option>
                  <option value="has_image">Has image</option>
                  <option value="no_image">Missing image</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Max rows
                <select
                  value={listSettings.limit}
                  onChange={(e) => updateListSettings({ limit: Number(e.target.value) || 200 })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  <option value={100}>100</option>
                  <option value={200}>200</option>
                  <option value={500}>500</option>
                  <option value={2500}>2500</option>
                </select>
              </label>
            </div>
          )}
          <p className="mt-3 text-xs text-slate-600">
            {catalogTotal != null ? (
              <>
                <strong>{catalogTotal.toLocaleString()}</strong> in Mini ·{' '}
                <strong>{listSummaryMatched.toLocaleString()}</strong>{' '}
                {pageTab === 'draft' ? 'awaiting publish' : 'matching'} · showing {visibleItems.length}
              </>
            ) : (
              'Loading catalog…'
            )}
            {(listLoading || searchInput !== debouncedQuery) && (
              <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin text-slate-400" />
            )}
          </p>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="max-h-[36rem] space-y-2 overflow-y-auto">
              {visibleItems.length === 0 && !listLoading && (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  {pageTab === 'draft'
                    ? 'No products awaiting publish. New items appear here when a sharing POS syncs a product that is not already in the federation catalog.'
                    : 'No products match this view.'}
                </p>
              )}
              {visibleItems.map((item) => {
                const imgSrc = resolveCanonicalImageSrc(item.image_url);
                const active = selected?.catalog_key === item.catalog_key;
                return (
                  <button
                    key={String(item.catalog_key)}
                    type="button"
                    onClick={() => openDetail(item)}
                    className={`flex w-full gap-3 rounded-xl border p-3 text-left text-sm transition ${
                      active ? 'border-violet-400 bg-violet-50' : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                    }`}
                  >
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                      {imgSrc ? (
                        <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-7 w-7 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{item.name || item.catalog_key}</span>
                        {item.publish_status && item.publish_status !== 'published' && (
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${publishStatusTone(item.publish_status)}`}
                          >
                            {publishStatusLabel(item.publish_status)}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {item.category || '—'} · {item.supplier || 'No supplier'}
                      </p>
                      <p className="font-mono text-[11px] text-slate-500">{item.barcode || '—'}</p>
                      {item.recommended_price != null && (
                        <p className="text-xs text-violet-800">
                          Rec. ${Number(item.recommended_price).toFixed(2)}
                          {item.cost_price != null && ` · Cost $${Number(item.cost_price).toFixed(2)}`}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
              {hasMore && (
                <button
                  type="button"
                  disabled={listLoading || busy}
                  onClick={() => void loadCanonical(canonicalItems.length, true)}
                  className="w-full rounded-xl border border-slate-200 py-2 text-sm font-medium text-slate-700"
                >
                  Load more
                </button>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              {!selected ? (
                <p className="text-sm text-slate-600">Select a product to view details and edit CD overrides.</p>
              ) : (
                <>
                  {detailLoading && (
                    <p className="mb-2 inline-flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading signals…
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {selected.publish_status !== 'published' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPublish('publish')}
                        className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Approve &amp; publish
                      </button>
                    )}
                    {selected.publish_status === 'published' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setPublish('draft')}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium"
                      >
                        Unpublish (draft)
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setPublish('archive')}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium"
                    >
                      Archive
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={deleteItem}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-800"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-slate-600">
                    <p>
                      Federation: {selected.federation?.sharing_store_count ?? 0} sharing ·{' '}
                      {selected.federation?.contributing_store_count ?? 0} reported this item ·{' '}
                      {selected.federation?.push_count ?? 0} pushes · last sync{' '}
                      {formatFederationLastSeen(selected.federation?.last_federated_at)}
                    </p>
                    <p className="text-[11px] leading-snug text-slate-500">
                      <strong className="font-medium text-slate-600">Sharing</strong> is how many POS
                      connections have catalog sharing turned on.{' '}
                      <strong className="font-medium text-slate-600">Reported</strong> and{' '}
                      <strong className="font-medium text-slate-600">pushes</strong> count only after those
                      stores sync this product to Mini.
                    </p>
                    <div className="flex flex-wrap gap-1">
                      <span
                        className={`rounded-md px-2 py-0.5 font-medium ${fieldStatusTone(selected.consensus?.barcode)}`}
                      >
                        {fieldStatusLabel('barcode', selected.consensus?.barcode)}
                      </span>
                      <span
                        className={`rounded-md px-2 py-0.5 font-medium ${fieldStatusTone(selected.consensus?.image_url)}`}
                      >
                        {fieldStatusLabel('image_url', selected.consensus?.image_url)}
                      </span>
                    </div>
                  </div>
                  <label className="mt-4 block text-sm font-medium text-slate-700">
                    Name
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-2 block text-sm font-medium text-slate-700">
                    Barcode
                    <input
                      value={editBarcode}
                      onChange={(e) => setEditBarcode(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                    />
                  </label>
                  <label className="mt-2 block text-sm font-medium text-slate-700">
                    Size / pack
                    <input
                      value={editSize}
                      onChange={(e) => setEditSize(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-2 block text-sm font-medium text-slate-700">
                    Category
                    <input
                      value={editCategory}
                      onChange={(e) => setEditCategory(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-2 block text-sm font-medium text-slate-700">
                    Supplier
                    <input
                      value={editSupplier}
                      onChange={(e) => setEditSupplier(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="mt-2 block text-sm font-medium text-slate-700">
                    Manufacturer / cost price
                    <input
                      value={editCostPrice}
                      onChange={(e) => setEditCostPrice(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    />
                  </label>
                  <FederationCatalogImageField
                    imageUrl={editImageUrl}
                    onImageUrlChange={setEditImageUrl}
                    searchFields={imageSearchFields}
                    disabled={busy}
                    onStatus={setStatus}
                  />
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={saveOverrides}
                      className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                    >
                      Save to catalog
                    </button>
                    {hasCdFieldOverride && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={clearCdOverrides}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Clear CD overrides
                      </button>
                    )}
                  </div>
                  {signals && Object.keys(signals).length > 0 && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs font-semibold text-slate-800">Store signals</p>
                      <pre className="mt-2 max-h-40 overflow-auto text-[10px] text-slate-600">
                        {JSON.stringify(signals, null, 2)}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </section>
      )}

      {pageTab === 'duplicates' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {dupLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : duplicateGroups.length === 0 ? (
            <p className="text-sm text-slate-600">
              No duplicates detected. Items with the same name but a different barcode or size are treated as separate
              products.
            </p>
          ) : (
            <div className="space-y-4">
              {duplicateGroups.map((group, index) => {
                const groupKey = `${group.kind}-${group.name}-${group.barcode}-${group.size}-${index}`;
                return (
                  <div key={groupKey} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="font-medium text-slate-900">{group.label || 'Duplicate group'}</p>
                    <p className="mt-1 text-sm text-slate-700">
                      <span className="font-semibold">Name:</span> {group.name || '—'}
                      {' · '}
                      <span className="font-semibold">Size:</span> {group.size || '—'}
                      {' · '}
                      <span className="font-semibold">Barcode:</span>{' '}
                      {group.barcode ? <span className="font-mono">{group.barcode}</span> : '—'}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-slate-700">
                      {(group.items || []).map((item) => (
                        <li key={String(item.catalog_key)}>
                          {item.name}
                          {item.size ? ` · ${item.size}` : ''}
                          {item.barcode ? ` · ${item.barcode}` : ''}
                          <span className="font-mono text-xs text-slate-500"> ({item.catalog_key})</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-6 rounded-xl border border-violet-100 bg-violet-50/50 p-4">
            <p className="text-sm font-medium text-slate-900">Merge duplicates</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={mergeTarget}
                onChange={(e) => setMergeTarget(e.target.value)}
                placeholder="Target catalog_key (keep)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={mergeSource}
                onChange={(e) => setMergeSource(e.target.value)}
                placeholder="Source catalog_key (archive)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={runMerge}
              className="mt-3 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Merge into target
            </button>
          </div>
        </section>
      )}

      {pageTab === 'categories' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          {catLoading ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
              {categories.map((row) => (
                <li key={String(row.name)} className="flex justify-between rounded-lg px-2 py-1 hover:bg-slate-50">
                  <span>{row.name}</span>
                  <span className="text-slate-500">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-900">Rename / merge category</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <input
                value={catFrom}
                onChange={(e) => setCatFrom(e.target.value)}
                placeholder="From category name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <input
                value={catTo}
                onChange={(e) => setCatTo(e.target.value)}
                placeholder="To category name"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={runCategoryMerge}
              className="mt-3 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Merge categories
            </button>
          </div>
        </section>
      )}

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Add catalog product</h3>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Name
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Barcode
              <input
                value={addBarcode}
                onChange={(e) => setAddBarcode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={busy || !addName.trim()}
                onClick={createItem}
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Working…
        </p>
      )}
    </div>
  );
}
