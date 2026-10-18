'use client';

import { useEffect, useMemo, useState } from 'react';
import { ImageIcon, Loader2, Pencil, Settings2, X } from 'lucide-react';
import { useCanonicalCatalogList } from '@/components/mini/catalog-library/useCanonicalCatalogList';
import { FederationCatalogImageField } from '@/components/mini/catalog-library/FederationCatalogImageField';
import {
  CanonicalCatalogItem,
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

type Props = {
  busy: boolean;
  canonicalTotal?: number;
  /** Bump when parent imports catalog or recomputes — triggers list reload */
  refreshToken?: number | string;
  runAction: (fn: () => Promise<void>) => void;
  libraryPost: <T>(path: string, body?: Record<string, unknown>) => Promise<T>;
  libraryFetch: <T>(path: string) => Promise<T>;
  setStatus: (msg: string) => void;
};

export function CanonicalCatalogPanel({
  busy,
  canonicalTotal,
  refreshToken,
  runAction,
  libraryPost,
  libraryFetch,
  setStatus,
}: Props) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [listSettings, setListSettings] = useState<CanonicalListFilterSettings>(() => loadCanonicalListFilters());
  const [showListSettings, setShowListSettings] = useState(false);
  const [editing, setEditing] = useState<CanonicalCatalogItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  const { listLoading, canonicalItems, matchedTotal, catalogTotal, hasMore, loadCanonical } =
    useCanonicalCatalogList(libraryFetch, listSettings, debouncedQuery, refreshToken, setStatus);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedQuery(searchInput.trim());
    }, 320);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const updateListSettings = (patch: Partial<CanonicalListFilterSettings>) => {
    setListSettings((prev) => {
      const next = { ...prev, ...patch };
      saveCanonicalListFilters(next);
      return next;
    });
  };

  const browseFullCatalog = () => {
    setSearchInput('');
    setDebouncedQuery('');
    updateListSettings({ filter: 'all', sort: 'name', limit: 2500 });
  };

  const miniCatalogSize = catalogTotal ?? canonicalTotal ?? null;

  const visibleItems = useMemo(() => {
    if (!debouncedQuery) return canonicalItems;
    return canonicalItems.filter((item) => matchesCanonicalSearchQuery(item, debouncedQuery));
  }, [canonicalItems, debouncedQuery]);

  const openEdit = (item: CanonicalCatalogItem) => {
    setEditing(item);
    setEditName(String(item.name || ''));
    setEditBarcode(String(item.barcode || ''));
    setEditImageUrl(String(item.image_url || ''));
  };

  const saveOverride = () => {
    if (!editing?.catalog_key) return;
    const key = encodeURIComponent(editing.catalog_key);
    runAction(async () => {
      await libraryPost(`pos-catalog/canonical/${key}/override`, {
        name: editName.trim(),
        barcode: editBarcode.trim(),
        image_url: editImageUrl.trim(),
      });
      setStatus('Canonical product updated — POS stores receive hints on next sync.');
      setEditing(null);
      await loadCanonical(0, false);
    });
  };

  const clearOverrides = () => {
    if (!editing?.catalog_key) return;
    const key = encodeURIComponent(editing.catalog_key);
    runAction(async () => {
      await libraryPost(`pos-catalog/canonical/${key}/override`, {
        name: '',
        barcode: '',
        image_url: '',
      });
      setStatus('CD overrides cleared — consensus policy applies again.');
      setEditing(null);
      await loadCanonical(0, false);
    });
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Canonical catalog</h3>
          <p className="mt-1 text-sm text-slate-600">
            {miniCatalogSize != null ? (
              <>
                <strong>{miniCatalogSize.toLocaleString()}</strong> products in Mini
                {matchedTotal !== miniCatalogSize && (
                  <>
                    {' '}
                    · <strong>{matchedTotal.toLocaleString()}</strong> match current filter/search
                  </>
                )}
                {' '}
                · showing <strong>{visibleItems.length.toLocaleString()}</strong>
                {debouncedQuery ? ' in results' : ' loaded'}
              </>
            ) : (
              <>Import starter catalog or sync POS stores to populate Mini.</>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={browseFullCatalog}
          className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
        >
          Browse full catalog
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        The list loads in pages (max rows in filter settings). Starter import is ~1,717 products — use{' '}
        <strong>Browse full catalog</strong> or set max rows to 2500.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Type to search name or barcode…"
            aria-label="Search canonical catalog"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 pr-9 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          />
          {(listLoading || searchInput !== debouncedQuery) && (
            <Loader2
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
              aria-hidden
            />
          )}
        </div>
        {searchInput.trim() && (
          <button
            type="button"
            onClick={() => {
              setSearchInput('');
              setDebouncedQuery('');
            }}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowListSettings((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-900 hover:bg-violet-100"
        >
          <Settings2 className="h-4 w-4" />
          Filter settings
        </button>
      </div>
      {showListSettings && (
        <div className="mt-3 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            Sort by
            <select
              value={listSettings.sort}
              onChange={(e) => updateListSettings({ sort: e.target.value as CanonicalListSort })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value="activity">Federation activity (often + recent)</option>
              <option value="recent">Most recently federated</option>
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
              <option value="all">All canonical products (default)</option>
              <option value="federated">Active in federation only</option>
              <option value="pending">Consensus in progress</option>
              <option value="override">CD overrides</option>
              <option value="has_image">Has image</option>
              <option value="no_image">Missing image</option>
              <option value="baseline">Starter / baseline only</option>
              <option value="draft">New — awaiting publish</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Max rows
            <select
              value={listSettings.limit}
              onChange={(e) => updateListSettings({ limit: Number(e.target.value) || 100 })}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
            >
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
              <option value={2500}>2500 (full starter)</option>
            </select>
          </label>
          <p className="sm:col-span-3 text-xs text-slate-600">
            Settings are saved in this browser. Loaded {canonicalItems.length} of {matchedTotal} matching · sort{' '}
            <span className="font-medium">{listSettings.sort}</span> · filter{' '}
            <span className="font-medium">{listSettings.filter}</span>
            {miniCatalogSize != null && ` · ${miniCatalogSize} total in Mini`}
          </p>
        </div>
      )}

      <div className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto">
        {visibleItems.length === 0 ? (
          <div className="space-y-2 text-sm text-slate-600">
            <p className="font-medium text-slate-700">
              {debouncedQuery ? `No products match “${debouncedQuery}”.` : 'No products match this view.'}
            </p>
            {debouncedQuery && (miniCatalogSize ?? 0) > 0 && matchedTotal === miniCatalogSize ? (
              <p className="text-amber-800">
                Search may not have reached Mini — refresh the page, then restart the CD API service if results still
                look unfiltered.
              </p>
            ) : null}
            {!debouncedQuery && listSettings.filter === 'federated' && (canonicalTotal ?? 0) > 0 ? (
              <p>
                Try <strong>Show → All canonical products</strong> for imported starter data, or enable POS catalog
                sharing and sync so federation activity appears here.
              </p>
            ) : (
              <p>Import starter catalog or enable sharing on POS stores.</p>
            )}
            {(canonicalTotal ?? 0) > 0 && (
              <p className="text-violet-700">Mini holds {canonicalTotal} canonical entries total.</p>
            )}
          </div>
        ) : (
          visibleItems.map((item) => {
            const imgSrc = resolveCanonicalImageSrc(item.image_url);
            const imageMeta = item.consensus?.image_url;
            const barcodeMeta = item.consensus?.barcode;
            return (
              <div
                key={String(item.catalog_key)}
                className="flex gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {imgSrc ? (
                    <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-8 w-8 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{item.name || item.catalog_key}</p>
                      {item.publish_status && item.publish_status !== 'published' && (
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${publishStatusTone(item.publish_status)}`}
                        >
                          {publishStatusLabel(item.publish_status)}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openEdit(item)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit on CD
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Barcode: <span className="font-mono">{item.barcode || '—'}</span>
                    {item.mini_catalog_id && (
                      <span className="ml-2 text-slate-500">· id {String(item.mini_catalog_id).slice(0, 8)}…</span>
                    )}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Federation: {item.federation?.sharing_store_count ?? 0} sharing ·{' '}
                    {item.federation?.contributing_store_count ?? 0} reported ·{' '}
                    {item.federation?.push_count ?? 0} push
                    {(item.federation?.push_count ?? 0) === 1 ? '' : 'es'} · last sync{' '}
                    {formatFederationLastSeen(item.federation?.last_federated_at)}
                  </p>
                  {item.recommended_price != null && (
                    <p className="mt-1 text-xs text-violet-800">
                      Recommended ${Number(item.recommended_price).toFixed(2)}
                      {item.price_sample_count != null && ` (${item.price_sample_count} store samples, advisory only)`}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${fieldStatusTone(barcodeMeta)}`}
                    >
                      {fieldStatusLabel('barcode', barcodeMeta)}
                    </span>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${fieldStatusTone(imageMeta)}`}
                    >
                      {fieldStatusLabel('image_url', imageMeta)}
                    </span>
                  </div>
                  {imageMeta?.status === 'pending' || imageMeta?.status === 'split' ? (
                    <p className="mt-1 text-[11px] text-amber-900">
                      Image change in progress — stores disagree or need more votes per policy.
                      {imageMeta.candidates && imageMeta.candidates.length > 1 && (
                        <span className="ml-1 text-slate-600">
                          ({imageMeta.distinct_values} variants reported)
                        </span>
                      )}
                    </p>
                  ) : null}
                  {item.image_url && (
                    <p className="mt-1 truncate text-[11px] text-slate-500" title={item.image_url}>
                      {item.image_url}
                    </p>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      {hasMore && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            disabled={listLoading || busy}
            onClick={() => void loadCanonical(canonicalItems.length, true)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Load more ({canonicalItems.length} of {matchedTotal})
          </button>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-lg font-semibold text-slate-900">Edit canonical product</h4>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Saves CD overrides on Mini. Connected POS systems pull these values as hints (unless pinned locally).
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Name
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Barcode
              <input
                value={editBarcode}
                onChange={(e) => setEditBarcode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
              />
            </label>
            <FederationCatalogImageField
              imageUrl={editImageUrl}
              onImageUrlChange={setEditImageUrl}
              searchFields={{ name: editName }}
              disabled={busy}
              onStatus={setStatus}
            />
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={saveOverride}
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                Save to catalog
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={clearOverrides}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Clear CD overrides
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-xl px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {busy && (
        <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Working…
        </p>
      )}
    </section>
  );
}
