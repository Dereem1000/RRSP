'use client';

import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  Delete,
  LayoutGrid,
  List,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react';
import { ClientSearchSelect } from '@/components/clients/ClientSearchSelect';
import { PosSectionNav } from '@/components/pos/PosSectionNav';
import type { ClientPickerOption } from '@/lib/client-picker';
import {
  POS_PRODUCT_KIND_LABELS,
  isPosItemKind,
  isPosProductSellable,
  matchesPosCategoryFilter,
  posSellableQuantity,
  tracksPosStock,
  type PosProduct,
  type PosProductCategory,
  type PosProductKind,
} from '@/lib/pos-catalog-shared';

function posApiRoot(mode: 'cd' | 'rrsp') {
  return mode === 'rrsp' ? '/api/rrsp/pos' : '/api/pos';
}

type CartLine = {
  productId: string;
  name: string;
  catalogUnitPrice: number;
  unitPrice: number;
  quantity: number;
  availableQuantity: number;
  kind: PosProductKind | 'custom';
  source: PosProduct['source'] | 'custom';
};

function productKindBadge(kind: PosProductKind) {
  if (kind === 'service') return { label: 'Service', className: 'bg-sky-100 text-sky-800' };
  if (kind === 'non_stock') return { label: 'Item · Untracked', className: 'bg-violet-100 text-violet-800' };
  return { label: 'Item · Stockable', className: 'bg-emerald-100 text-emerald-800' };
}

function isOutOfStock(product: PosProduct) {
  return tracksPosStock(product.kind) && posSellableQuantity(product) <= 0;
}

function stockLabel(product: PosProduct) {
  if (product.kind === 'service') return 'Service';
  if (product.kind === 'non_stock') return 'Qty not tracked';
  const sellable = posSellableQuantity(product);
  if (sellable <= 0) {
    return product.source === 'parts' ? 'Not listed / no stock' : 'Out of stock';
  }
  return product.source === 'parts' ? `${sellable} mkt` : `${sellable} in stock`;
}

type CategoryFilter = 'all' | PosProductCategory;
type StockFilter = 'all' | 'in_stock' | 'out_of_stock';
type SourceFilter = 'all' | 'pos' | 'parts';
type PaymentMethod = 'CASH' | 'CARD' | 'bank_transfer';
type ProductLayout = 'grid' | 'list';

const FILTER_CHIP =
  'min-h-9 rounded-lg px-2.5 py-1.5 text-xs font-medium transition whitespace-nowrap';
const FILTER_CHIP_ON = 'bg-slate-900 text-white';
const FILTER_CHIP_OFF = 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50';
const FILTER_LABEL =
  'shrink-0 text-[11px] font-medium normal-case tracking-normal text-slate-500 after:ml-0.5 after:content-[":"]';
const FILTER_LABEL_MOBILE =
  'mb-1 block text-[10px] font-medium normal-case tracking-normal text-slate-500 after:ml-0.5 after:content-[":"]';

type KeypadTarget =
  | { kind: 'price'; productId: string }
  | { kind: 'qty'; productId: string }
  | null;

function formatMoney(amount: number) {
  return `TTD ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPriceInput(value: number) {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value * 100) / 100);
}

const KEYPAD_KEYS = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '.',
  '0',
  'back',
] as const;

export function PosPageClient({
  mode,
  initialProducts,
  clients,
  walkInClientId,
  accountingHref,
  canManageProducts = false,
}: {
  mode: 'cd' | 'rrsp';
  initialProducts: PosProduct[];
  clients: ClientPickerOption[];
  walkInClientId: string;
  accountingHref: string;
  canManageProducts?: boolean;
}) {
  const [products, setProducts] = useState(initialProducts);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [clientId, setClientId] = useState(walkInClientId);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<{
    invoiceNumber: string;
    invoiceId: string;
    amount: number;
  } | null>(null);
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    sku: '',
    unitPrice: '',
    quantity: '1',
    description: '',
    kind: 'physical' as PosProductKind,
  });
  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget>(null);
  const [draftValue, setDraftValue] = useState('');
  const [mobileKeypadOpen, setMobileKeypadOpen] = useState(false);
  const [productLayout, setProductLayout] = useState<ProductLayout>('grid');
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [kindFilter, setKindFilter] = useState<CategoryFilter>('all');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (!matchesPosCategoryFilter(p.kind, kindFilter)) return false;
      if (sourceFilter === 'pos' && p.source === 'parts') return false;
      if (sourceFilter === 'parts' && p.source !== 'parts') return false;
      if (stockFilter === 'in_stock') {
        if (tracksPosStock(p.kind) && posSellableQuantity(p) <= 0) return false;
      }
      if (stockFilter === 'out_of_stock' && !isOutOfStock(p)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.sku ?? '').toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [products, search, kindFilter, stockFilter, sourceFilter]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0),
    [cart]
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.quantity, 0),
    [cart]
  );

  const activeLine = useMemo(() => {
    if (!keypadTarget) return null;
    return cart.find((line) => line.productId === keypadTarget.productId) ?? null;
  }, [cart, keypadTarget]);

  function addToCart(product: PosProduct) {
    setReceipt(null);
    setError('');
    if (!isPosProductSellable(product)) return;
    const maxQty = posSellableQuantity(product);
    setCart((prev) => {
      const existing = prev.find((line) => line.productId === product.id);
      if (existing) {
        if (tracksPosStock(product.kind) && existing.quantity >= maxQty) {
          return prev;
        }
        return prev.map((line) =>
          line.productId === product.id
            ? {
                ...line,
                quantity: line.quantity + 1,
                availableQuantity: maxQty,
                catalogUnitPrice: product.unitPrice,
                kind: product.kind,
                source: product.source,
              }
            : line
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          catalogUnitPrice: product.unitPrice,
          unitPrice: product.unitPrice,
          quantity: 1,
          availableQuantity: maxQty,
          kind: product.kind,
          source: product.source,
        },
      ];
    });
  }

  function setLineQty(productId: string, quantity: number) {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.productId !== productId) return line;
          const qty = Math.max(0, Math.min(line.availableQuantity, Math.floor(quantity)));
          return { ...line, quantity: qty };
        })
        .filter((line) => line.quantity > 0)
    );
  }

  function setLinePrice(productId: string, unitPrice: number) {
    const next = Math.max(0, Math.round(unitPrice * 100) / 100);
    setCart((prev) =>
      prev.map((line) => (line.productId === productId ? { ...line, unitPrice: next } : line))
    );
  }

  function focusKeypad(target: Exclude<KeypadTarget, null>, initial: string) {
    setKeypadTarget(target);
    setDraftValue(initial);
  }

  /** Add an ad-hoc line and focus the price keypad (no catalog product required). */
  function startOpenItem(initialPrice = '') {
    setReceipt(null);
    setError('');
    const productId =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? `custom-${crypto.randomUUID()}`
        : `custom-${Date.now()}`;
    const parsed =
      initialPrice && initialPrice !== '.'
        ? Number.parseFloat(initialPrice.endsWith('.') ? `${initialPrice}0` : initialPrice)
        : 0;
    const line: CartLine = {
      productId,
      name: 'Open item',
      catalogUnitPrice: 0,
      unitPrice: Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100) / 100) : 0,
      quantity: 1,
      availableQuantity: 9999,
      kind: 'custom',
      source: 'custom',
    };
    setCart((prev) => [...prev, line]);
    focusKeypad({ kind: 'price', productId }, initialPrice);
    setMobileCartOpen(true);
    setMobileKeypadOpen(true);
    return productId;
  }

  function applyDraftToTarget(nextDraft: string, target: Exclude<KeypadTarget, null> = keypadTarget!) {
    if (!target) return;
    if (target.kind === 'qty') {
      if (nextDraft === '') return;
      const qty = Number.parseInt(nextDraft, 10);
      if (!Number.isFinite(qty)) return;
      setLineQty(target.productId, Math.max(1, qty));
      return;
    }
    if (nextDraft === '' || nextDraft === '.') return;
    const price = Number.parseFloat(nextDraft);
    if (!Number.isFinite(price)) return;
    setLinePrice(target.productId, price);
  }

  function handleKeypad(key: (typeof KEYPAD_KEYS)[number] | 'clear' | 'done') {
    let target = keypadTarget;

    // No cart field selected — start an open item and type into its price.
    if (!target) {
      if (key === 'done' || key === 'clear' || key === 'back') return;
      setError('');
      startOpenItem(key === '.' ? '0.' : key);
      return;
    }

    setError('');

    if (key === 'done') {
      const line = cart.find((l) => l.productId === target!.productId);
      if (target.kind === 'qty' && (draftValue === '' || draftValue === '0')) {
        setLineQty(target.productId, 0);
      } else if (target.kind === 'price' && line?.source === 'custom') {
        const price = draftValue === '' || draftValue === '.' ? 0 : Number.parseFloat(draftValue);
        if (!Number.isFinite(price) || price <= 0) {
          setLineQty(target.productId, 0);
        } else {
          applyDraftToTarget(draftValue, target);
        }
      } else {
        applyDraftToTarget(draftValue === '' ? '0' : draftValue, target);
      }
      setKeypadTarget(null);
      setDraftValue('');
      return;
    }

    if (key === 'clear') {
      setDraftValue('');
      return;
    }

    let next = draftValue;
    if (key === 'back') {
      next = draftValue.slice(0, -1);
    } else if (target.kind === 'qty') {
      if (key === '.') return;
      if (draftValue === '0') next = key === '0' ? '0' : key;
      else next = `${draftValue}${key}`.slice(0, 4);
    } else {
      if (key === '.' && draftValue.includes('.')) return;
      const [whole, frac = ''] = (key === '.' ? `${draftValue}.` : `${draftValue}${key}`).split('.');
      next = frac ? `${whole}.${frac.slice(0, 2)}` : key === '.' ? `${whole}.` : whole;
      if (next.length > 10) return;
    }

    setDraftValue(next);
    applyDraftToTarget(next, target);
  }

  async function refreshProducts() {
    setLoading('refresh');
    setError('');
    try {
      const res = await fetch(`${posApiRoot(mode)}/products`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load products');
      setProducts(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products');
    } finally {
      setLoading('');
    }
  }

  async function completeSale() {
    if (!cart.length) {
      setError('Add at least one item to the cart.');
      return;
    }
    if (!clientId) {
      setError('Select a customer (or Walk-in).');
      return;
    }
    setLoading('sale');
    setError('');
    setReceipt(null);
    setKeypadTarget(null);
    try {
      const res = await fetch(`${posApiRoot(mode)}/sales`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          paymentMethod,
          lines: cart.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            custom: line.source === 'custom',
            name: line.name,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Sale failed');
      setCart([]);
      setClientId(walkInClientId);
      setPaymentMethod('CASH');
      setMobileCartOpen(false);
      setReceipt({
        invoiceNumber: data.invoice?.invoiceNumber ?? data.invoice?.invoice_number ?? '—',
        invoiceId: data.invoice?.id ?? '',
        amount: Number(data.amount) || 0,
      });
      await refreshProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sale failed');
    } finally {
      setLoading('');
    }
  }

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    setLoading('product');
    setError('');
    try {
      const tracked = tracksPosStock(productForm.kind);
      const quantity = tracked
        ? Math.max(0, Math.floor(Number(productForm.quantity) || 0))
        : 0;
      const res = await fetch(`${posApiRoot(mode)}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: productForm.name,
          sku: productForm.sku || null,
          description: productForm.description || null,
          unitPrice: Number(productForm.unitPrice),
          quantity,
          kind: productForm.kind,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create product');
      setShowAddProduct(false);
      setProductForm({
        name: '',
        sku: '',
        unitPrice: '',
        quantity: '1',
        description: '',
        kind: 'physical',
      });
      await refreshProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create product');
    } finally {
      setLoading('');
    }
  }

  const keypadHint =
    keypadTarget?.kind === 'price'
      ? `Editing price${activeLine ? ` · ${activeLine.name}` : ''}`
      : keypadTarget?.kind === 'qty'
        ? `Editing qty${activeLine ? ` · ${activeLine.name}` : ''}`
        : 'Open item or tap cart price/qty';

  return (
    <div className="flex flex-col gap-2 touch-manipulation max-lg:min-h-[calc(100dvh-8rem)] max-lg:pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:gap-3 lg:min-h-0 lg:flex-1 lg:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            {mode === 'rrsp' ? 'Shop POS' : 'Point of sale'}
          </h1>
          <p className="mt-1 hidden text-sm text-slate-500 sm:block">
            {mode === 'rrsp'
              ? 'Sell shop POS products and your Parts stock when available.'
              : 'Sell POS products and Our Stock Parts. Inventory manages the POS catalog.'}
            </p>
          </div>
        <PosSectionNav mode={mode} />
        </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {receipt && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p>
            Sale complete — invoice{' '}
            <span className="font-semibold">{receipt.invoiceNumber}</span> ·{' '}
            {formatMoney(receipt.amount)}
          </p>
          <div className="flex items-center gap-2">
            {receipt.invoiceId ? (
              <Link
                href={`${accountingHref}?invoice=${receipt.invoiceId}`}
                className="min-h-11 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
              >
                View invoice
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setReceipt(null)}
              className="min-h-11 min-w-11 rounded-lg p-2 text-emerald-800 hover:bg-emerald-100"
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 max-lg:min-h-0 max-lg:flex-1 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,1fr)] lg:items-start">
        {/* Products — full width on mobile; ~75% on desktop */}
        <section className="flex flex-col rounded-2xl border border-slate-200 bg-white p-3 shadow-sm max-lg:min-h-0 sm:p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 basis-full sm:basis-auto sm:min-w-[12rem]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products…"
                className="w-full rounded-xl border border-slate-200 py-3 pl-10 pr-3 text-base outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setProductLayout('grid')}
                className={`inline-flex min-h-10 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
                  productLayout === 'grid'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                aria-pressed={productLayout === 'grid'}
                title="Grid layout"
              >
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => setProductLayout('list')}
                className={`inline-flex min-h-10 min-w-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium transition ${
                  productLayout === 'list'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
                aria-pressed={productLayout === 'list'}
                title="List layout"
              >
                <List className="h-4 w-4" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => void refreshProducts()}
              disabled={!!loading}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading === 'refresh' ? 'animate-spin' : ''}`} />
              Refresh
            </button>
              <button
                type="button"
                onClick={() => setShowAddProduct(true)}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                Add product
              </button>
          </div>

          {/* Mobile: compact selects · Desktop: one chip row */}
          <div className="mb-3 grid grid-cols-3 gap-2 sm:hidden">
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
          <div className="mb-3 hidden items-center gap-1.5 whitespace-nowrap sm:flex sm:flex-wrap">
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

          <div className="pb-1 max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto max-lg:overscroll-contain">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <p className="text-sm text-slate-500">
                  No products match your search or filters.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(true)}
                  className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white hover:bg-indigo-700"
                >
                  <Plus className="h-4 w-4" />
                  Add product
                </button>
              </div>
            ) : productLayout === 'grid' ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((product) => {
                  const kindBadge = productKindBadge(product.kind);
                  const oos = isOutOfStock(product);
                  return (
                  <button
                    key={`${product.source}-${product.id}`}
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={!isPosProductSellable(product)}
                    className={`relative flex min-h-[5.5rem] flex-col justify-between rounded-2xl border p-3 text-left transition active:scale-[0.98] disabled:opacity-70 ${
                      oos
                        ? 'border-amber-200 bg-amber-50/70 hover:border-amber-300'
                        : 'border-slate-100 bg-slate-50/80 hover:border-indigo-200 hover:bg-indigo-50/50'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-start gap-1">
                        {product.source === 'parts' ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Parts
                          </span>
                        ) : (
                          <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            POS
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${kindBadge.className}`}
                        >
                          {kindBadge.label}
                        </span>
                        {oos ? (
                          <span className="rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            Out of stock
                          </span>
                        ) : null}
                      </div>
                      <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                        {product.name}
                      </p>
                      <p className={`mt-1 text-xs ${oos ? 'font-medium text-red-700' : 'text-slate-500'}`}>
                        {product.sku ? `SKU ${product.sku} · ` : ''}
                        {stockLabel(product)}
                      </p>
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-800">
                      {formatMoney(product.unitPrice)}
                    </p>
                  </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((product) => {
                  const kindBadge = productKindBadge(product.kind);
                  const oos = isOutOfStock(product);
                  return (
                <button
                    key={`${product.source}-${product.id}`}
                  type="button"
                  onClick={() => addToCart(product)}
                    disabled={!isPosProductSellable(product)}
                    className={`flex min-h-14 w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition active:scale-[0.99] disabled:opacity-70 ${
                      oos
                        ? 'border-amber-200 bg-amber-50/70 hover:border-amber-300'
                        : 'border-slate-100 bg-slate-50/80 hover:border-indigo-200 hover:bg-indigo-50/50'
                    }`}
                >
                  <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {product.source === 'parts' ? (
                          <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                            Parts
                          </span>
                        ) : (
                          <span className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                            POS
                          </span>
                        )}
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${kindBadge.className}`}
                        >
                          {kindBadge.label}
                        </span>
                        {oos ? (
                          <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            Out of stock
                          </span>
                        ) : null}
                        <p className="truncate text-sm font-semibold text-slate-900">{product.name}</p>
                      </div>
                      <p className={`mt-0.5 text-xs ${oos ? 'font-medium text-red-700' : 'text-slate-500'}`}>
                      {product.sku ? `SKU ${product.sku} · ` : ''}
                        {stockLabel(product)}
                    </p>
                  </div>
                    <p className="shrink-0 text-sm font-bold text-slate-800">
                    {formatMoney(product.unitPrice)}
                  </p>
                </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Cart + Pay: side column on desktop; bottom sheet on mobile */}
        <aside
          className={
            mobileCartOpen
              ? 'fixed inset-0 z-[100] flex flex-col lg:sticky lg:inset-auto lg:top-4 lg:z-auto lg:max-h-[calc(100dvh-7.5rem)] lg:self-start lg:overflow-hidden'
              : 'hidden max-h-[calc(100dvh-7.5rem)] min-h-0 flex-col gap-3 overflow-hidden lg:sticky lg:top-4 lg:flex lg:self-start'
          }
        >
          {mobileCartOpen ? (
            <button
              type="button"
              className="min-h-0 flex-1 bg-slate-900/45 lg:hidden"
              aria-label="Close cart"
              onClick={() => setMobileCartOpen(false)}
            />
          ) : null}

          <div
            className={
              mobileCartOpen
                ? 'flex max-h-[88dvh] min-h-0 flex-col gap-3 overflow-hidden rounded-t-3xl bg-slate-100 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:max-h-full lg:flex-1 lg:rounded-none lg:bg-transparent lg:p-0'
                : 'flex min-h-0 max-h-full flex-1 flex-col gap-3 overflow-hidden'
            }
          >
            {mobileCartOpen ? (
              <div className="flex items-center justify-between gap-2 lg:hidden">
                <h2 className="text-base font-semibold text-slate-900">Cart & pay</h2>
                <button
                  type="button"
                  onClick={() => setMobileCartOpen(false)}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : null}

          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex shrink-0 items-center justify-between gap-2">
              <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-indigo-600" />
            <h2 className="text-sm font-semibold text-slate-900">Cart</h2>
                {cartCount > 0 ? (
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    {cartCount}
                  </span>
                ) : null}
          </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => startOpenItem()}
                  className="min-h-10 rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Open item
                </button>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCart([]);
                      setKeypadTarget(null);
                    }}
                    className="min-h-10 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-red-600"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

          {cart.length === 0 ? (
              <p className="flex flex-1 items-center justify-center py-6 text-center text-sm text-slate-500">
                Tap products, or use Open item for an unlisted sale.
              </p>
            ) : (
              <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                {cart.map((line) => {
                  const priceActive =
                    keypadTarget?.kind === 'price' && keypadTarget.productId === line.productId;
                  const qtyActive =
                    keypadTarget?.kind === 'qty' && keypadTarget.productId === line.productId;
                  const priceAdjusted =
                    line.source !== 'custom' &&
                    Math.abs(line.unitPrice - line.catalogUnitPrice) > 0.001;
                  return (
                <li
                  key={line.productId}
                      className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {line.source === 'parts' ? (
                            <span className="mb-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                              Parts
                            </span>
                          ) : line.source === 'custom' ? (
                            <span className="mb-0.5 inline-block rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Open
                            </span>
                          ) : null}
                          <p className="text-sm font-medium leading-snug text-slate-900">
                            {line.name}
                          </p>
                        </div>
                    <button
                      type="button"
                          onClick={() => {
                            setLineQty(line.productId, 0);
                            if (keypadTarget?.productId === line.productId) {
                              setKeypadTarget(null);
                            }
                          }}
                          className="min-h-10 min-w-10 shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white hover:text-red-600"
                      aria-label="Remove"
                    >
                          <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                      <div className="mt-2 flex items-center gap-2">
                        <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white">
                      <button
                        type="button"
                            className="flex min-h-11 min-w-11 items-center justify-center text-slate-600 active:bg-slate-100"
                        onClick={() => setLineQty(line.productId, line.quantity - 1)}
                      >
                            <Minus className="h-4 w-4" />
                      </button>
                          {/* Mobile: device keyboard */}
                          <input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onFocus={() => {
                              setMobileKeypadOpen(true);
                              focusKeypad(
                                { kind: 'qty', productId: line.productId },
                                String(line.quantity)
                              );
                            }}
                            onChange={(e) => {
                              const qty = Math.floor(Number(e.target.value) || 0);
                              setLineQty(line.productId, qty);
                            }}
                            className="min-h-11 w-14 border-0 bg-transparent px-1 text-center text-base font-semibold text-slate-900 outline-none lg:hidden"
                            aria-label="Quantity"
                          />
                          {/* Desktop / counter: on-screen keypad */}
                      <button
                        type="button"
                            onClick={() =>
                              focusKeypad({ kind: 'qty', productId: line.productId }, String(line.quantity))
                            }
                            className={`hidden min-h-11 min-w-[2.75rem] px-1 text-center text-base font-semibold lg:inline ${
                              qtyActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-900'
                            }`}
                          >
                            {qtyActive && draftValue !== '' ? draftValue : line.quantity}
                          </button>
                          <button
                            type="button"
                            className="flex min-h-11 min-w-11 items-center justify-center text-slate-600 active:bg-slate-100"
                        onClick={() => setLineQty(line.productId, line.quantity + 1)}
                      >
                            <Plus className="h-4 w-4" />
                      </button>
                    </div>

                        {/* Mobile: device keyboard for price */}
                        <label className="min-h-11 flex-1 lg:hidden">
                          <span className="sr-only">Unit price</span>
                          <div
                            className={`flex min-h-11 items-center justify-end gap-1 rounded-xl border px-2 ${
                              priceAdjusted
                                ? 'border-amber-300 bg-amber-50'
                                : 'border-slate-200 bg-white'
                            }`}
                          >
                            <span className="text-xs text-slate-500">TTD</span>
                            <input
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.01"
                              value={formatPriceInput(line.unitPrice)}
                              onFocus={() => {
                                setMobileKeypadOpen(true);
                                focusKeypad(
                                  { kind: 'price', productId: line.productId },
                                  formatPriceInput(line.unitPrice)
                                );
                              }}
                              onChange={(e) => {
                                const price = Number.parseFloat(e.target.value);
                                setLinePrice(line.productId, Number.isFinite(price) ? price : 0);
                              }}
                              className="w-full min-w-0 bg-transparent py-2 text-right text-sm font-semibold text-slate-800 outline-none"
                            />
                          </div>
                        </label>

                        {/* Desktop / counter: on-screen keypad for price */}
                        <button
                          type="button"
                          onClick={() =>
                            focusKeypad(
                              { kind: 'price', productId: line.productId },
                              formatPriceInput(line.unitPrice)
                            )
                          }
                          className={`hidden min-h-11 flex-1 rounded-xl border px-2 text-right text-sm font-semibold lg:block ${
                            priceActive
                              ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                              : priceAdjusted
                                ? 'border-amber-300 bg-amber-50 text-amber-900'
                                : 'border-slate-200 bg-white text-slate-800'
                          }`}
                          title="Tap to edit unit price"
                        >
                          {priceActive && draftValue !== ''
                            ? `TTD ${draftValue}`
                            : formatMoney(line.unitPrice)}
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-500">
                            {priceAdjusted ? 'Adjusted · tap to edit' : 'Unit · tap to edit'}
                          </span>
                        </button>
                      </div>

                      <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500">
                        {priceAdjusted ? (
                          <button
                            type="button"
                            className="min-h-9 rounded px-1 font-medium text-amber-700 hover:bg-amber-50"
                            onClick={() => setLinePrice(line.productId, line.catalogUnitPrice)}
                          >
                            Reset to {formatMoney(line.catalogUnitPrice)}
                          </button>
                        ) : (
                          <span />
                        )}
                        <span className="font-semibold text-slate-800">
                      {formatMoney(line.unitPrice * line.quantity)}
                        </span>
                  </div>
                </li>
                  );
                })}
            </ul>
          )}

            <div className="mt-2 flex shrink-0 items-center justify-between border-t border-slate-100 pt-2">
            <span className="text-sm text-slate-500">Total</span>
              <span className="text-xl font-bold text-slate-900">{formatMoney(cartTotal)}</span>
          </div>
        </section>

          <section className="shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                <span className="lg:hidden">Pay</span>
                <span className="hidden lg:inline">Pay & keypad</span>
              </h2>
              <button
                type="button"
                onClick={() => startOpenItem()}
                className="min-h-9 shrink-0 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open item
              </button>
            </div>
            <p className="mb-2 hidden truncate text-[11px] text-slate-500 lg:block">{keypadHint}</p>
            <div className="mb-2 lg:hidden">
              <p className="mb-1.5 text-[11px] leading-snug text-slate-500">
                Tap qty or price on a line to use your device keyboard, or open the on-screen keypad.
              </p>
              <button
                type="button"
                onClick={() => setMobileKeypadOpen((open) => !open)}
                className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                aria-expanded={mobileKeypadOpen}
              >
                {mobileKeypadOpen ? 'Hide on-screen keypad' : 'On-screen keypad'}
              </button>
              {mobileKeypadOpen ? (
                <p className="mt-1.5 truncate text-[11px] text-slate-500">{keypadHint}</p>
              ) : null}
            </div>

            <label className="mb-2 block">
            <span className="mb-1 block text-xs font-medium text-slate-600">Customer</span>
            <ClientSearchSelect
              clients={clients}
              value={clientId}
              onChange={(id) => setClientId(id || walkInClientId)}
              placeholder="Walk-in or search…"
                inputClassName="w-full min-h-11 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
            />
          </label>

            <div className="mb-2">
            <span className="mb-1 block text-xs font-medium text-slate-600">Tender</span>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    ['CASH', 'Cash'],
                    ['CARD', 'Card'],
                    ['bank_transfer', 'Transfer'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPaymentMethod(value)}
                    className={`min-h-11 rounded-xl border px-2 text-sm font-medium transition active:scale-[0.98] ${
                      paymentMethod === value
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* On-screen keypad — optional on mobile; always on counter/desktop */}
            <div
              className={`mb-2 min-h-10 items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-base font-semibold text-slate-900 ${
                mobileKeypadOpen ? 'flex' : 'hidden'
              } lg:flex`}
            >
              <span className="truncate">
                {keypadTarget ? (draftValue === '' ? '0' : draftValue) : '—'}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                {keypadTarget ? (
                  <button
                    type="button"
                    onClick={() => handleKeypad('clear')}
                    className="min-h-8 rounded-lg px-2 text-xs font-medium text-slate-500 hover:bg-white"
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => handleKeypad('done')}
                  disabled={!keypadTarget}
                  className="min-h-8 rounded-lg bg-slate-900 px-2.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Done
                </button>
              </div>
            </div>

            <div
              className={`mb-2 grid-cols-3 gap-1.5 ${
                mobileKeypadOpen ? 'grid' : 'hidden'
              } lg:grid`}
            >
              {KEYPAD_KEYS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleKeypad(key)}
                  className="flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-semibold text-slate-800 transition active:scale-[0.96] hover:bg-white"
                >
                  {key === 'back' ? <Delete className="h-5 w-5" /> : key}
                </button>
              ))}
            </div>

          <button
            type="button"
            onClick={() => void completeSale()}
            disabled={!!loading || cart.length === 0}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-base font-semibold text-white hover:bg-indigo-700 active:scale-[0.99] disabled:opacity-60"
          >
            {loading === 'sale' ? (
                <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
                <ShoppingCart className="h-5 w-5" />
            )}
            Complete sale
          </button>
        </section>
          </div>
        </aside>
      </div>

      <button
        type="button"
        onClick={() => setMobileCartOpen(true)}
        className={`fixed right-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-[45] flex min-h-12 max-w-[calc(100%-1.5rem)] items-center gap-3 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-950/20 active:scale-[0.99] lg:hidden${mobileCartOpen ? ' hidden' : ''}`}
        aria-label={cartCount > 0 ? `Open cart, ${cartCount} items` : 'Open cart'}
      >
        <span className="inline-flex items-center gap-2">
          <ShoppingCart className="h-5 w-5 shrink-0" />
          <span className="truncate">
            {cartCount > 0 ? `Cart · ${cartCount}` : 'Cart'}
          </span>
        </span>
        <span className="shrink-0 font-bold">{formatMoney(cartTotal)}</span>
      </button>

      {showAddProduct &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-900/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
            <form
              onSubmit={(e) => void createProduct(e)}
              className="max-h-[min(92dvh,40rem)] w-full max-w-md space-y-3 overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-900">Add product</h3>
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="min-h-11 min-w-11 text-slate-400"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Type
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['items', 'Items'],
                      ['services', 'Services'],
                    ] as const
                  ).map(([value, label]) => {
                    const selected =
                      value === 'services'
                        ? productForm.kind === 'service'
                        : isPosItemKind(productForm.kind);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setProductForm((f) => ({
                            ...f,
                            kind: value === 'services' ? 'service' : f.kind === 'service' ? 'physical' : f.kind,
                          }))
                        }
                        aria-pressed={selected}
                        className={`min-h-12 rounded-xl border px-2 py-2 text-sm font-semibold transition ${
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
                {isPosItemKind(productForm.kind) ? (
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
                        onClick={() => setProductForm((f) => ({ ...f, kind: value }))}
                        aria-pressed={productForm.kind === value}
                        className={`min-h-11 rounded-xl border px-2 py-2 text-sm font-medium transition ${
                          productForm.kind === value
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                ) : null}
                <p className="text-xs text-slate-500">{POS_PRODUCT_KIND_LABELS[productForm.kind]}</p>
              </fieldset>
              <input
                required
                value={productForm.name}
                onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Name"
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
              />
              <input
                value={productForm.sku}
                onChange={(e) => setProductForm((f) => ({ ...f, sku: e.target.value }))}
                placeholder="SKU (optional)"
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={productForm.unitPrice}
                  onChange={(e) => setProductForm((f) => ({ ...f, unitPrice: e.target.value }))}
                  placeholder="Unit price"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
                />
                {tracksPosStock(productForm.kind) ? (
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={productForm.quantity}
                    onChange={(e) => setProductForm((f) => ({ ...f, quantity: e.target.value }))}
                    placeholder="Qty"
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
                  />
                ) : (
                  <div className="flex items-center rounded-xl border border-slate-100 bg-slate-50 px-3 text-xs text-slate-600">
                    No qty tracking
                  </div>
                )}
              </div>
              <textarea
                value={productForm.description}
                onChange={(e) => setProductForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Description (optional)"
                rows={2}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddProduct(false)}
                  className="min-h-12 rounded-xl border border-slate-200 px-4 py-3 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading === 'product'}
                  className="min-h-12 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-60"
                >
                  {loading === 'product' ? 'Saving…' : 'Save product'}
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
}
