'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ClientSearchSelect } from '@/components/clients/ClientSearchSelect';
import { StatCard } from '@/components/dashboard/StatCard';
import {
  EmailMonitoringPanel,
  EmptyOrdersState,
  Eye,
  LoadingState,
  OrderFormFields,
  RefreshCw,
  Search,
  StaffOrderDetailModal,
  StageBadge,
  StatusBadge,
  emptyOrderForm,
  formatDate,
  formatMoney,
  type OrderFormValues,
  type OrderView,
} from '@/components/orders/order-ui';
import { ORDER_STATUSES, SHIPPING_STAGES } from '@/lib/order-constants';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import type { ClientPickerOption } from '@/lib/client-picker';
import { ClientLink, OrderLink } from '@/components/links/DocumentLinks';
import { AlertTriangle, CheckCircle2, Clock, Package, Plus, Truck } from 'lucide-react';

type ClientOption = ClientPickerOption;

type PaginationMeta = { total: number; page: number; limit: number; pages: number };

const PAGE_SIZE = 20;
const EMPTY_PAGINATION: PaginationMeta = { total: 0, page: 1, limit: PAGE_SIZE, pages: 0 };

function canSubmitNewOrder(form: OrderFormValues, showCost?: boolean) {
  if (!form.clientId.trim() || !form.title.trim() || !form.itemName.trim()) return false;
  if (form.clientPrice === '' || Number.isNaN(Number(form.clientPrice))) return false;
  if (showCost && (form.costPrice === '' || Number.isNaN(Number(form.costPrice)))) return false;
  return true;
}

function OrderFormModal({
  title,
  form,
  onChange,
  clients,
  showCost,
  loading,
  error,
  onClose,
  onSubmit,
  isNewOrder,
}: {
  title: string;
  form: OrderFormValues;
  onChange: (patch: Partial<OrderFormValues>) => void;
  clients: ClientOption[];
  showCost?: boolean;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: () => void;
  isNewOrder?: boolean;
}) {
  const canSubmit = !isNewOrder || canSubmitNewOrder(form, showCost);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {isNewOrder && <p className="mt-0.5 text-sm text-slate-500">Client required · ticket created automatically</p>}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <OrderFormFields form={form} onChange={onChange} clients={clients} showCost={showCost} isNewOrder={isNewOrder} />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || !canSubmit}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Saving…' : isNewOrder ? 'Create order & ticket' : 'Create order'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function StaffOrdersPageClient({
  isAdmin,
  clients,
}: {
  isAdmin: boolean;
  clients: ClientOption[];
}) {
  const searchParams = useSearchParams();
  const { askToEmailClient } = useClientEmailPolicy();
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [summary, setSummary] = useState<{ total: number; ordered: number; shipped: number; delivered: number } | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [status, setStatus] = useState('all');
  const [shippingStage, setShippingStage] = useState('all');
  const [clientId, setClientId] = useState('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<OrderView | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<OrderFormValues>(() => emptyOrderForm());
  const [createError, setCreateError] = useState('');
  const [notice, setNotice] = useState<{ text: string; ticketId?: string; ticketNumber?: string } | null>(null);

  useEffect(() => {
    const clientIdParam = searchParams.get('clientId');
    if (searchParams.get('create') === '1') {
      setShowCreate(true);
      if (clientIdParam) {
        setCreateForm(emptyOrderForm(clientIdParam));
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const orderId = searchParams.get('order');
    if (orderId) void openDetail(orderId);
  }, [searchParams]);

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/msp/orders?summary=1');
    const data = await res.json();
    if (res.ok) setSummary(data.summary);
  }, []);

  const loadOrders = useCallback(async () => {
    setLoading('list');
    setError('');
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (status !== 'all') params.set('status', status);
    if (shippingStage !== 'all') params.set('shippingStage', shippingStage);
    if (clientId !== 'all') params.set('clientId', clientId);
    if (search) params.set('search', search);

    try {
      const res = await fetch(`/api/msp/orders?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load orders');
      setOrders(data.orders ?? []);
      setPagination(data.pagination ?? EMPTY_PAGINATION);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading('');
    }
  }, [page, status, shippingStage, clientId, search]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  async function openDetail(id: string) {
    setLoading(`detail-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/orders/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load order');
      setDetail(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load order');
    } finally {
      setLoading('');
    }
  }

  async function createOrder() {
    if (!createForm.clientId.trim()) {
      setCreateError('Please select a client before creating the order.');
      return;
    }
    if (!createForm.title.trim() || !createForm.itemName.trim()) {
      setCreateError('Title and item name are required.');
      return;
    }

    setLoading('create');
    setCreateError('');
    try {
      const sendEmail = askToEmailClient('Email the client about this new order?');
      const res = await fetch('/api/msp/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: createForm.clientId,
          title: createForm.title,
          itemName: createForm.itemName,
          costPrice: Number(createForm.costPrice),
          clientPrice: Number(createForm.clientPrice),
          quantity: Number(createForm.quantity) || 1,
          description: createForm.description || null,
          itemUrl: createForm.itemUrl || null,
          vendor: createForm.vendor || null,
          vendorOrderNumber: createForm.vendorOrderNumber || null,
          trackingNumber: createForm.trackingNumber || null,
          orderDate: createForm.orderDate,
          estimatedArrival: createForm.estimatedArrival || null,
          status: createForm.status,
          shippingStage: createForm.shippingStage,
          currentLocation: createForm.currentLocation || null,
          isLoggedInPreAlerts: createForm.isLoggedInPreAlerts,
          preAlertNotes: createForm.preAlertNotes || null,
          notes: createForm.notes || null,
          sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create order');
      setShowCreate(false);
      setCreateForm(emptyOrderForm());
      if (data.ticket?.id) {
        setNotice({
          text: data.message ?? 'Order and ticket created.',
          ticketId: data.ticket.id,
          ticketNumber: data.ticket.ticketNumber,
        });
      } else if (data.ticketError) {
        setNotice({ text: `Order saved, but ticket failed: ${data.ticketError}` });
      } else {
        setNotice({ text: data.message ?? 'Order created.' });
      }
      loadSummary();
      loadOrders();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setLoading('');
    }
  }

  async function checkNonPreAlerted() {
    setLoading('prealert');
    setNotice(null);
    try {
      const res = await fetch('/api/msp/orders/check-non-pre-alerted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hoursThreshold: 24 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Check failed');
      setNotice({ text: data.message });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Check failed' });
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Orders</h1>
          <p className="mt-1 text-sm text-slate-500">Track parts and shipments for clients</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  setCreateForm(emptyOrderForm());
                  setCreateError('');
                  setShowCreate(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" />
                New order
              </button>
              <button
                type="button"
                onClick={checkNonPreAlerted}
                disabled={!!loading}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-60"
              >
                <AlertTriangle className="h-4 w-4" />
                {loading === 'prealert' ? 'Checking…' : 'Check pre-alerts'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              loadSummary();
              loadOrders();
            }}
            disabled={!!loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading === 'list' ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice.text}
          {notice.ticketId && notice.ticketNumber && (
            <>
              {' '}
              <Link href={`/tickets/${notice.ticketId}`} className="font-semibold text-indigo-700 underline hover:text-indigo-900">
                View ticket {notice.ticketNumber}
              </Link>
            </>
          )}
        </div>
      )}

      {summary && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total orders" value={summary.total} icon={Package} accent="bg-blue-50 text-blue-600" />
          <StatCard label="Ordered" value={summary.ordered} icon={Clock} accent="bg-slate-50 text-slate-600" />
          <StatCard label="In transit" value={summary.shipped} icon={Truck} accent="bg-amber-50 text-amber-600" />
          <StatCard label="Delivered" value={summary.delivered} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-600" />
        </div>
      )}

      {isAdmin && <EmailMonitoringPanel />}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-4">
          <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select value={shippingStage} onChange={(e) => { setPage(1); setShippingStage(e.target.value); }} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="all">All stages</option>
            {SHIPPING_STAGES.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <ClientSearchSelect
            clients={clients}
            value={clientId}
            onChange={(id) => { setPage(1); setClientId(id || 'all'); }}
            allowAll
            placeholder="Filter by client…"
            inputClassName="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setPage(1);
              setSearch(searchInput.trim());
            }}
          >
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search orders…"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <button type="submit" className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50">
              <Search className="h-4 w-4" />
            </button>
          </form>
        </div>
        <p className="mt-3 text-xs text-slate-500">{pagination.total} result{pagination.total === 1 ? '' : 's'}</p>
      </div>

      {loading === 'list' && orders.length === 0 ? (
        <LoadingState />
      ) : orders.length === 0 ? (
        <EmptyOrdersState />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                {['Order', 'Client', 'Item', 'Status', 'Stage', 'Location', 'Date', 'Price', ''].map((h) => (
                  <th key={h || 'actions'} className="px-4 py-3 font-semibold text-slate-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <OrderLink id={order.id} label={order.orderNumber} className="font-medium text-slate-900 hover:text-indigo-700" />
                    <p className="text-xs text-slate-500">{order.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <ClientLink
                      id={order.clientId ?? order.client?.id}
                      label={order.client?.name ?? '—'}
                      className="text-slate-900 hover:text-indigo-700"
                    />
                  </td>
                  <td className="px-4 py-3">{order.itemName}</td>
                  <td className="px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="px-4 py-3"><StageBadge stage={order.shippingStage} /></td>
                  <td className="px-4 py-3 text-slate-600">{order.currentLocation ?? '—'}</td>
                  <td className="px-4 py-3">{formatDate(order.orderDate)}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(order.clientPrice)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      title="View details"
                      aria-label="View details"
                      onClick={() => openDetail(order.id)}
                      disabled={!!loading}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                    >
                      {loading === `detail-${order.id}` ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <button type="button" disabled={pagination.page <= 1 || !!loading} onClick={() => setPage((p) => p - 1)} className="rounded-xl border px-3 py-1.5 disabled:opacity-50">Previous</button>
            <button type="button" disabled={pagination.page >= pagination.pages || !!loading} onClick={() => setPage((p) => p + 1)} className="rounded-xl border px-3 py-1.5 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {showCreate && (
        <OrderFormModal
          title="New order"
          isNewOrder
          form={createForm}
          onChange={(patch) => setCreateForm((f) => ({ ...f, ...patch }))}
          clients={clients}
          showCost={isAdmin}
          loading={loading === 'create'}
          error={createError}
          onClose={() => setShowCreate(false)}
          onSubmit={createOrder}
        />
      )}

      {detail && (
        <StaffOrderDetailModal
          order={detail}
          showCost={isAdmin}
          isAdmin={isAdmin}
          clients={clients}
          onClose={() => setDetail(null)}
          onUpdated={(updated) => {
            setDetail(updated);
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
            loadSummary();
          }}
          onDeleted={() => {
            setDetail(null);
            loadSummary();
            loadOrders();
          }}
        />
      )}
    </div>
  );
}
