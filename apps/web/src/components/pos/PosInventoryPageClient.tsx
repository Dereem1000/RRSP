'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import {
  POS_PRODUCT_KIND_LABELS,
  isPosItemKind,
  matchesPosCategoryFilter,
  tracksPosStock,
  type PosProduct,
  type PosProductCategory,
  type PosProductKind,
} from '@/lib/pos-catalog-shared';
import { PosSectionNav } from '@/components/pos/PosSectionNav';

function posApiRoot(mode: 'cd' | 'rrsp') {
  return mode === 'rrsp' ? '/api/rrsp/pos' : '/api/pos';
}

function formatMoney(amount: number) {
  return `TTD ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function kindBadgeClass(kind: PosProductKind) {
  if (kind === 'service') return 'bg-sky-100 text-sky-800';
  if (kind === 'non_stock') return 'bg-violet-100 text-violet-800';
  return 'bg-emerald-100 text-emerald-800';
}

function kindBadgeLabel(kind: PosProductKind) {
  if (kind === 'service') return 'Service';
  if (kind === 'non_stock') return 'Item · Untracked';
  return 'Item · Stockable';
}

function isOutOfStock(product: PosProduct) {
  if (product.source === 'parts') return product.quantity <= 0;
  return tracksPosStock(product.kind) && product.quantity <= 0;
}

type CategoryFilter = 'all' | PosProductCategory;
type StockFilter = 'all' | 'in_stock' | 'out_of_stock';
type SourceFilter = 'all' | 'pos' | 'parts';
type StockAdjustAction = 'add' | 'remove' | 'receive_po';

const FILTER_CHIP =
  'min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap';
const FILTER_CHIP_ON = 'bg-slate-900 text-white';
const FILTER_CHIP_OFF = 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50';
const FILTER_LABEL =
  'shrink-0 text-[11px] font-medium normal-case tracking-normal text-slate-500 after:ml-0.5 after:content-[":"]';
const FILTER_LABEL_MOBILE =
  'mb-1 block text-[10px] font-medium normal-case tracking-normal text-slate-500 after:ml-0.5 after:content-[":"]';

type ProductForm = {
  id?: string;
  name: string;
  sku: string;
  unitPrice: string;
  quantity: string;
  availableQuantity: string;
  description: string;
  costPrice: string;
  kind: PosProductKind;
  /** null until user picks POS vs Parts on Add. */
  source: PosProduct['source'] | null;
  /** Parts only: list Available qty on the marketplace. */
  listOnMarketplace: boolean;
};

type StockAdjustForm = {
  product: PosProduct;
  action: StockAdjustAction;
  quantity: string;
  poNumber: string;
  note: string;
};

function emptyForm(_mode: 'cd' | 'rrsp'): ProductForm {
  return {
    name: '',
    sku: '',
    unitPrice: '',
    quantity: '0',
    availableQuantity: '0',
    description: '',
    costPrice: '0',
    kind: 'physical',
    source: null,
    listOnMarketplace: false,
  };
}

function formFromProduct(product: PosProduct): ProductForm {
  const tracked = tracksPosStock(product.kind) || product.source === 'parts';
  return {
    id: product.id,
    name: product.name,
    sku: product.sku ?? '',
    unitPrice: String(product.unitPrice),
    quantity: tracked ? String(product.quantity) : '0',
    availableQuantity: tracked ? String(product.availableQuantity) : '0',
    description: product.description ?? '',
    costPrice: String(product.costPrice ?? 0),
    kind: product.kind ?? 'physical',
    source: product.source,
    listOnMarketplace: product.source === 'parts' && product.availableQuantity > 0,
  };
}

export function PosInventoryPageClient({
  mode,
  initialProducts,
}: {
  mode: 'cd' | 'rrsp';
  initialProducts: PosProduct[];
}) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<CategoryFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [form, setForm] = useState<ProductForm | null>(null);
  const [stockAdjust, setStockAdjust] = useState<StockAdjustForm | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!matchesPosCategoryFilter(p.kind, kindFilter)) return false;
      if (sourceFilter === 'pos' && p.source === 'parts') return false;
      if (sourceFilter === 'parts' && p.source !== 'parts') return false;
      if (stockFilter === 'in_stock') {
        if ((tracksPosStock(p.kind) || p.source === 'parts') && p.quantity <= 0) {
          return false;
        }
      }
      if (stockFilter === 'out_of_stock' && !isOutOfStock(p)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        POS_PRODUCT_KIND_LABELS[p.kind].toLowerCase().includes(q) ||
        kindBadgeLabel(p.kind).toLowerCase().includes(q) ||
        (p.source === 'parts' && 'parts'.includes(q))
      );
    });
  }, [products, search, kindFilter, stockFilter, sourceFilter]);

  const stockedProducts = useMemo(
    () => products.filter((p) => tracksPosStock(p.kind) || p.source === 'parts'),
    [products]
  );

  const unitsOnHand = useMemo(
    () => stockedProducts.reduce((sum, p) => sum + p.quantity, 0),
    [stockedProducts]
  );

  const outOfStock = useMemo(
    () => stockedProducts.filter((p) => p.quantity <= 0).length,
    [stockedProducts]
  );

  const formIsParts = form?.source === 'parts';
  const formTracksStock = form ? tracksPosStock(form.kind) || formIsParts : false;

  async function refresh() {
    setLoading('refresh');
    setError('');
    try {
      const res = await fetch(`${posApiRoot(mode)}/products?inventory=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load inventory');
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load inventory');
    } finally {
      setLoading('');
    }
  }

  async function saveProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.source) {
      setError('Choose POS or Parts / marketplace first.');
      return;
    }
    setLoading('save');
    setError('');
    setNotice('');
    try {
      const source = form.source;
      const tracked = tracksPosStock(form.kind) || source === 'parts';
      const quantity = tracked ? Math.max(0, Math.floor(Number(form.quantity) || 0)) : 0;
      const availableQuantity =
        source === 'parts'
          ? form.listOnMarketplace
            ? Math.min(quantity, Math.max(0, Math.floor(Number(form.availableQuantity) || 0)))
            : 0
          : tracked
            ? quantity
            : 0;
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        description: form.description.trim() || null,
        unitPrice: Number(form.unitPrice),
        costPrice: Number(form.costPrice) || 0,
        quantity,
        availableQuantity,
        kind: source === 'parts' ? 'physical' : form.kind,
        source: source === 'parts' ? 'parts' : undefined,
        listOnMarketplace: source === 'parts' ? form.listOnMarketplace : undefined,
      };
      if (source === 'parts' && !form.listOnMarketplace && quantity <= 0) {
        throw new Error('Parts stock needs a quantity greater than zero');
      }
      if (source === 'parts' && form.listOnMarketplace && availableQuantity <= 0) {
        throw new Error('Marketplace listings need Available greater than zero');
      }
      const res = await fetch(
        form.id ? `${posApiRoot(mode)}/products/${form.id}` : `${posApiRoot(mode)}/products`,
        {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save product');
      setForm(null);
      setNotice(
        source === 'parts'
          ? form.id
            ? form.listOnMarketplace
              ? 'Parts stock updated. Available quantity is listed on the marketplace.'
              : 'Parts stock updated (shop only — not on marketplace).'
            : form.listOnMarketplace
              ? 'Marketplace Parts listing created.'
              : 'Parts stock created (shop only).'
          : form.id
            ? 'Product updated.'
            : 'Product added.'
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    } finally {
      setLoading('');
    }
  }

  async function submitStockAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!stockAdjust) return;
    setLoading('stock');
    setError('');
    setNotice('');
    try {
      const res = await fetch(`${posApiRoot(mode)}/products/${stockAdjust.product.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: stockAdjust.action,
          quantity: Math.max(1, Math.floor(Number(stockAdjust.quantity) || 0)),
          poNumber: stockAdjust.poNumber.trim() || null,
          note: stockAdjust.note.trim() || null,
          source: stockAdjust.product.source === 'parts' ? 'parts' : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Stock adjustment failed');
      setStockAdjust(null);
      setNotice(
        stockAdjust.action === 'receive_po'
          ? `Received stock against PO ${stockAdjust.poNumber.trim()}.`
          : stockAdjust.action === 'add'
            ? 'Stock added.'
            : 'Stock removed.'
      );
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock adjustment failed');
    } finally {
      setLoading('');
    }
  }

  function openStockAdjust(product: PosProduct, action: StockAdjustAction) {
    setForm(null);
    setStockAdjust({
      product,
      action,
      quantity: '1',
      poNumber: '',
      note: '',
    });
  }

  async function removeProduct(product: PosProduct) {
    const label = product.source === 'parts' ? 'Parts listing' : 'POS product';
    if (!window.confirm(`Remove “${product.name}” (${label})?`)) return;
    setLoading(`delete-${product.id}`);
    setError('');
    setNotice('');
    try {
      const qs = product.source === 'parts' ? '?source=parts' : '';
      const res = await fetch(`${posApiRoot(mode)}/products/${product.id}${qs}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Failed to remove product');
      setNotice(product.source === 'parts' ? 'Parts listing removed.' : 'Product removed.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove product');
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="flex flex-col gap-3 touch-manipulation max-lg:min-h-[calc(100dvh-8rem)] sm:gap-4">
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {mode === 'rrsp' ? 'Shop POS inventory' : 'POS inventory'}
          </h1>
          <p className="mt-1 hidden text-sm text-slate-500 sm:block">
            Manage POS items/services and Parts stock. Use Add product → Parts / marketplace to list stock for sale online.
          </p>
        </div>
        <PosSectionNav mode={mode} />
      </div>

      <div className="shrink-0 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs text-sky-900 sm:text-sm">
        <p className="font-semibold">Note</p>
        <p className="mt-0.5 leading-snug">
          <span className="font-medium">POS</span> catalog items use Quantity for counter sales.{' '}
          <span className="font-medium">Parts</span> Quantity is on-hand stock; Marketplace is only
          filled when the part is set to sell online. Use Add / Remove / Receive PO to change
          on-hand stock.
        </p>
      </div>

      {error && (
        <div className="shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      <div className="grid shrink-0 grid-cols-3 gap-2 sm:gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm sm:rounded-2xl sm:px-4 sm:py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
            Products
          </p>
          <p className="mt-0.5 text-lg font-bold text-slate-900 sm:mt-1 sm:text-2xl">
            {products.length}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm sm:rounded-2xl sm:px-4 sm:py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
            Units on hand
          </p>
          <p className="mt-0.5 text-lg font-bold text-slate-900 sm:mt-1 sm:text-2xl">{unitsOnHand}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm sm:rounded-2xl sm:px-4 sm:py-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs">
            Out of stock
          </p>
          <p
            className={`mt-0.5 text-lg font-bold sm:mt-1 sm:text-2xl ${
              outOfStock ? 'text-amber-700' : 'text-slate-900'
            }`}
          >
            {outOfStock}
          </p>
        </div>
      </div>

      <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm max-lg:min-h-0 max-lg:flex-1 sm:p-4">
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2 sm:mb-4">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search inventory…"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={!!loading}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading === 'refresh' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setForm(emptyForm(mode))}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Add product
          </button>
        </div>

        {/* Mobile: compact selects · Desktop: one chip row */}
        <div className="mb-3 grid shrink-0 grid-cols-3 gap-2 sm:hidden">
          <label className="block min-w-0">
            <span className={FILTER_LABEL_MOBILE}>Filter by type</span>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value as CategoryFilter)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-800"
            >
              <option value="all">All types</option>
              <option value="items">Items</option>
              <option value="services">Services</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className={FILTER_LABEL_MOBILE}>Filter by stock</span>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value as StockFilter)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-800"
            >
              <option value="all">Any stock</option>
              <option value="in_stock">In stock</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </label>
          <label className="block min-w-0">
            <span className={FILTER_LABEL_MOBILE}>Filter by source</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
              className="w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-800"
            >
              <option value="all">All sources</option>
              <option value="pos">POS</option>
              <option value="parts">Parts</option>
            </select>
          </label>
        </div>
        <div className="mb-3 hidden shrink-0 items-center gap-1.5 whitespace-nowrap sm:mb-4 sm:flex sm:flex-wrap">
          <span className={FILTER_LABEL}>Filter by type</span>
          {(
            [
              ['all', 'All types'],
              ['items', 'Items'],
              ['services', 'Services'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKindFilter(value)}
              className={`shrink-0 ${FILTER_CHIP} ${kindFilter === value ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
            >
              {label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden />
          <span className={FILTER_LABEL}>Filter by stock</span>
          {(
            [
              ['all', 'Any stock'],
              ['in_stock', 'In stock'],
              ['out_of_stock', 'Out of stock'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setStockFilter(value)}
              className={`shrink-0 ${FILTER_CHIP} ${stockFilter === value ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
            >
              {label}
            </button>
          ))}
          <span className="mx-0.5 h-4 w-px shrink-0 bg-slate-200" aria-hidden />
          <span className={FILTER_LABEL}>Filter by source</span>
          {(
            [
              ['all', 'All sources'],
              ['pos', 'POS'],
              ['parts', 'Parts'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSourceFilter(value)}
              className={`shrink-0 ${FILTER_CHIP} ${sourceFilter === value ? FILTER_CHIP_ON : FILTER_CHIP_OFF}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto max-lg:overscroll-contain">
          {filtered.length === 0 ? (
            <p className="flex h-full min-h-[12rem] items-center justify-center py-8 text-center text-sm text-slate-500">
              No products match your search or filters.
            </p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-[1] bg-white">
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-2 py-2 font-medium">Product</th>
                  <th className="px-2 py-2 font-medium">Type</th>
                  <th className="px-2 py-2 font-medium">SKU</th>
                  <th className="px-2 py-2 font-medium">Price</th>
                  <th className="px-2 py-2 font-medium">Qty</th>
                  <th className="px-2 py-2 font-medium">Marketplace</th>
                  <th className="px-2 py-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product) => {
                  const tracked = tracksPosStock(product.kind) || product.source === 'parts';
                  // Parts: OOS = no on-hand qty. Marketplace avail is separate (column only when listed).
                  const oos =
                    product.source === 'parts'
                      ? product.quantity <= 0
                      : isOutOfStock(product);
                  return (
                    <tr
                      key={`${product.source}-${product.id}`}
                      className={`border-b border-slate-50 last:border-0 ${oos ? 'bg-amber-50/50' : ''}`}
                    >
                      <td className="px-2 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {product.source === 'parts' ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              Parts
                            </span>
                          ) : (
                            <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                              POS
                            </span>
                          )}
                          <p className="font-medium text-slate-900">{product.name}</p>
                          {oos ? (
                            <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                              Out of stock
                            </span>
                          ) : null}
                        </div>
                        {product.description ? (
                          <p className="text-xs text-slate-500 line-clamp-1">{product.description}</p>
                        ) : null}
                        {product.source === 'parts' && product.availableQuantity > 0 ? (
                          <p className="mt-0.5 text-[11px] text-sky-700">Listed on marketplace</p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        <span
                          className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${kindBadgeClass(product.kind)}`}
                        >
                          {product.source === 'parts' ? 'Parts stock' : kindBadgeLabel(product.kind)}
                        </span>
                      </td>
                      <td className="px-2 py-3 text-slate-600">{product.sku || '—'}</td>
                      <td className="px-2 py-3 font-medium text-slate-800">
                        {formatMoney(product.unitPrice)}
                      </td>
                      <td className="px-2 py-3 text-slate-700">{tracked ? product.quantity : '—'}</td>
                      <td className="px-2 py-3">
                        {product.source === 'parts' && product.availableQuantity > 0 ? (
                          <span className="font-medium text-slate-800">
                            {product.availableQuantity}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex justify-end gap-1">
                          {tracked ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openStockAdjust(product, 'add')}
                                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                aria-label="Add stock"
                                title="Add stock"
                              >
                                <PackagePlus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openStockAdjust(product, 'remove')}
                                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-amber-200 text-amber-700 hover:bg-amber-50"
                                aria-label="Remove stock"
                                title="Remove stock"
                              >
                                <PackageMinus className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openStockAdjust(product, 'receive_po')}
                                className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-sky-200 text-sky-700 hover:bg-sky-50"
                                aria-label="Receive by PO"
                                title="Receive by PO"
                              >
                                <Truck className="h-4 w-4" />
                              </button>
                            </>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => setForm(formFromProduct(product))}
                            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                            aria-label="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeProduct(product)}
                            disabled={loading === `delete-${product.id}`}
                            className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                            aria-label="Remove"
                          >
                            {loading === `delete-${product.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {form &&
        typeof document !== 'undefined' &&
        createPortal(
        <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <form
            onSubmit={(e) => void saveProduct(e)}
            className="max-h-[min(92dvh,42rem)] w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">
                {form.id ? 'Edit product' : 'Add product'}
              </h3>
              <button type="button" onClick={() => setForm(null)} className="min-h-10 min-w-10 text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <fieldset className="space-y-2">
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                {form.id ? 'Type' : form.source ? 'Type' : 'What are you adding?'}
              </legend>
              {!form.id && !form.source ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              source: mode === 'rrsp' ? 'shop' : 'cd',
                              kind: 'physical',
                              listOnMarketplace: false,
                              quantity: '0',
                              availableQuantity: '0',
                            }
                          : f
                      )
                    }
                    className="min-h-14 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/60"
                  >
                    <span className="block text-sm font-semibold text-slate-900">POS</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Catalog items &amp; services for counter sales
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              source: 'parts',
                              kind: 'physical',
                              listOnMarketplace: true,
                              quantity: '1',
                              availableQuantity: '1',
                            }
                          : f
                      )
                    }
                    className="min-h-14 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left transition hover:border-amber-300 hover:bg-amber-50/60"
                  >
                    <span className="block text-sm font-semibold text-slate-900">
                      Parts / marketplace
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      On-hand Parts stock, optionally listed online
                    </span>
                  </button>
                </div>
              ) : null}

              {!form.id && form.source ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                  <p className="text-sm font-medium text-slate-800">
                    {formIsParts ? 'Parts / marketplace' : 'POS'}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              source: null,
                              kind: 'physical',
                              listOnMarketplace: false,
                              quantity: '0',
                              availableQuantity: '0',
                            }
                          : f
                      )
                    }
                    className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  >
                    Change
                  </button>
                </div>
              ) : null}

              {form.source && formIsParts ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        [false, 'Shop stock only'],
                        [true, 'Sell on marketplace'],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() =>
                          setForm((f) =>
                            f
                              ? {
                                  ...f,
                                  listOnMarketplace: value,
                                  availableQuantity: value
                                    ? f.availableQuantity === '0'
                                      ? f.quantity === '0'
                                        ? '1'
                                        : f.quantity
                                      : f.availableQuantity
                                    : '0',
                                  quantity:
                                    f.quantity === '0' || f.quantity === ''
                                      ? '1'
                                      : f.quantity,
                                }
                              : f
                          )
                        }
                        aria-pressed={form.listOnMarketplace === value}
                        className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                          form.listOnMarketplace === value
                            ? 'border-amber-600 bg-amber-600 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-600">
                    {form.listOnMarketplace
                      ? 'Available is how many units buyers can request (≤ Quantity).'
                      : 'Not listed on the marketplace. Available stays at 0.'}
                  </p>
                </div>
              ) : null}

              {form.source && !formIsParts ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        ['items', 'Items'],
                        ['services', 'Services'],
                      ] as const
                    ).map(([value, label]) => {
                      const selected =
                        value === 'services' ? form.kind === 'service' : isPosItemKind(form.kind);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    kind:
                                      value === 'services'
                                        ? 'service'
                                        : f.kind === 'service'
                                          ? 'physical'
                                          : f.kind,
                                    quantity:
                                      value === 'services'
                                        ? '0'
                                        : tracksPosStock(f.kind === 'service' ? 'physical' : f.kind)
                                          ? f.quantity
                                          : '0',
                                    availableQuantity:
                                      value === 'services'
                                        ? '0'
                                        : tracksPosStock(f.kind === 'service' ? 'physical' : f.kind)
                                          ? f.availableQuantity
                                          : '0',
                                  }
                                : f
                            );
                          }}
                          aria-pressed={selected}
                          className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-semibold transition ${
                            selected
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-white'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {isPosItemKind(form.kind) ? (
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['physical', 'Stockable'],
                          ['non_stock', 'Untracked'],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            setForm((f) =>
                              f
                                ? {
                                    ...f,
                                    kind: value,
                                    quantity: tracksPosStock(value) ? f.quantity : '0',
                                    availableQuantity: tracksPosStock(value)
                                      ? f.availableQuantity
                                      : '0',
                                  }
                                : f
                            );
                          }}
                          aria-pressed={form.kind === value}
                          className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-medium transition ${
                            form.kind === value
                              ? 'border-slate-900 bg-slate-900 text-white'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-xs text-slate-500">{POS_PRODUCT_KIND_LABELS[form.kind]}</p>
                </>
              ) : null}
            </fieldset>

            {form.source ? (
              <>
            <input
              required
              value={form.name}
              onChange={(e) => setForm((f) => (f ? { ...f, name: e.target.value } : f))}
              placeholder="Name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
            <input
              value={form.sku}
              onChange={(e) => setForm((f) => (f ? { ...f, sku: e.target.value } : f))}
              placeholder="SKU (optional)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Unit price</span>
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.unitPrice}
                  onChange={(e) => setForm((f) => (f ? { ...f, unitPrice: e.target.value } : f))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Cost (optional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.costPrice}
                  onChange={(e) => setForm((f) => (f ? { ...f, costPrice: e.target.value } : f))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
            </div>
            {formTracksStock ? (
              <div
                className={`grid gap-2 ${
                  formIsParts && form.listOnMarketplace ? 'grid-cols-2' : 'grid-cols-1'
                }`}
              >
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">
                    {formIsParts ? 'Quantity (on hand)' : 'Quantity'}
                  </span>
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={form.quantity}
                    onChange={(e) => {
                      const quantity = e.target.value;
                      setForm((f) =>
                        f
                          ? {
                              ...f,
                              quantity,
                              // POS sellable qty tracks on-hand; Parts marketplace avail is separate.
                              availableQuantity:
                                f.source === 'parts'
                                  ? f.listOnMarketplace && !f.id
                                    ? quantity
                                    : f.availableQuantity
                                  : quantity,
                            }
                          : f
                      );
                    }}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
                {formIsParts && form.listOnMarketplace ? (
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Available (marketplace)
                    </span>
                    <input
                      required
                      type="number"
                      min="0"
                      step="1"
                      value={form.availableQuantity}
                      onChange={(e) =>
                        setForm((f) => (f ? { ...f, availableQuantity: e.target.value } : f))
                      }
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    />
                  </label>
                ) : null}
              </div>
            ) : (
              <p className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                {form.kind === 'service'
                  ? 'Services do not track inventory quantity.'
                  : 'This item does not track quantity — it can always be sold.'}
              </p>
            )}
            {form.id && formTracksStock && form.source ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Stock movements
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      form.id &&
                      form.source &&
                      openStockAdjust(
                        {
                          id: form.id,
                          name: form.name,
                          sku: form.sku || null,
                          description: form.description || null,
                          unitPrice: Number(form.unitPrice) || 0,
                          costPrice: Number(form.costPrice) || 0,
                          quantity: Number(form.quantity) || 0,
                          availableQuantity: Number(form.availableQuantity) || 0,
                          kind: form.kind,
                          source: form.source,
                        },
                        'add'
                      )
                    }
                    className="inline-flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-emerald-200 bg-white px-2 py-2 text-[11px] font-semibold text-emerald-800"
                  >
                    <PackagePlus className="h-4 w-4" />
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      form.id &&
                      form.source &&
                      openStockAdjust(
                        {
                          id: form.id,
                          name: form.name,
                          sku: form.sku || null,
                          description: form.description || null,
                          unitPrice: Number(form.unitPrice) || 0,
                          costPrice: Number(form.costPrice) || 0,
                          quantity: Number(form.quantity) || 0,
                          availableQuantity: Number(form.availableQuantity) || 0,
                          kind: form.kind,
                          source: form.source,
                        },
                        'remove'
                      )
                    }
                    className="inline-flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-amber-200 bg-white px-2 py-2 text-[11px] font-semibold text-amber-800"
                  >
                    <PackageMinus className="h-4 w-4" />
                    Remove
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      form.id &&
                      form.source &&
                      openStockAdjust(
                        {
                          id: form.id,
                          name: form.name,
                          sku: form.sku || null,
                          description: form.description || null,
                          unitPrice: Number(form.unitPrice) || 0,
                          costPrice: Number(form.costPrice) || 0,
                          quantity: Number(form.quantity) || 0,
                          availableQuantity: Number(form.availableQuantity) || 0,
                          kind: form.kind,
                          source: form.source,
                        },
                        'receive_po'
                      )
                    }
                    className="inline-flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-sky-200 bg-white px-2 py-2 text-[11px] font-semibold text-sky-800"
                  >
                    <Truck className="h-4 w-4" />
                    By PO
                  </button>
                </div>
              </div>
            ) : null}
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => (f ? { ...f, description: e.target.value } : f))}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading === 'save'}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {loading === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {form.id ? 'Save changes' : 'Add product'}
              </button>
            </div>
              </>
            ) : (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setForm(null)}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            )}
          </form>
        </div>,
        document.body
      )}

      {stockAdjust &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
            <form
              onSubmit={(e) => void submitStockAdjust(e)}
              className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">
                  {stockAdjust.action === 'receive_po'
                    ? 'Receive by PO'
                    : stockAdjust.action === 'add'
                      ? 'Add stock'
                      : 'Remove stock'}
                </h3>
                <button
                  type="button"
                  onClick={() => setStockAdjust(null)}
                  className="min-h-10 min-w-10 text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-slate-600">
                <span className="font-medium text-slate-900">{stockAdjust.product.name}</span>
                <span className="text-slate-400"> · on hand {stockAdjust.product.quantity}</span>
              </p>
              {stockAdjust.action === 'receive_po' ? (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-600">PO number</span>
                  <input
                    required
                    value={stockAdjust.poNumber}
                    onChange={(e) =>
                      setStockAdjust((s) => (s ? { ...s, poNumber: e.target.value } : s))
                    }
                    placeholder="e.g. PO-1042"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                  />
                </label>
              ) : null}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Quantity</span>
                <input
                  required
                  type="number"
                  min="1"
                  step="1"
                  value={stockAdjust.quantity}
                  onChange={(e) =>
                    setStockAdjust((s) => (s ? { ...s, quantity: e.target.value } : s))
                  }
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-600">Note (optional)</span>
                <input
                  value={stockAdjust.note}
                  onChange={(e) => setStockAdjust((s) => (s ? { ...s, note: e.target.value } : s))}
                  placeholder="Reason or vendor"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </label>
              <p className="text-xs text-slate-500">
                {stockAdjust.product.source === 'parts'
                  ? 'This changes on-hand Quantity only. Marketplace Available is set separately when the part type is “Sell on marketplace”.'
                  : 'POS Available updates with on-hand stock for stockable catalog items.'}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStockAdjust(null)}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading === 'stock'}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading === 'stock' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Confirm
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}
