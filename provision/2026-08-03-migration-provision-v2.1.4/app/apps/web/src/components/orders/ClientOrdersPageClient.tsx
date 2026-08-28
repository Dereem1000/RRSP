'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  EmptyOrdersState,
  Eye,
  LoadingState,
  OrderDetailModal,
  StageBadge,
  StatusBadge,
  formatDate,
  formatMoney,
  type OrderView,
} from '@/components/orders/order-ui';
import { ShipmentJourney } from '@/components/orders/ShipmentJourney';
import { ORDER_STATUSES, SHIPPING_STAGES, getTrackingUrl } from '@/lib/order-constants';
import { ExternalLink, MapPin, Package, Truck } from 'lucide-react';
import { OrderLink } from '@/components/links/DocumentLinks';

type PaginationMeta = { total: number; page: number; limit: number; pages: number };

const PAGE_SIZE = 12;
const EMPTY_PAGINATION: PaginationMeta = { total: 0, page: 1, limit: PAGE_SIZE, pages: 0 };

export function ClientOrdersPageClient() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderView[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [status, setStatus] = useState('all');
  const [shippingStage, setShippingStage] = useState('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<OrderView | null>(null);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (status !== 'all') params.set('status', status);
    if (shippingStage !== 'all') params.set('shippingStage', shippingStage);

    try {
      const res = await fetch(`/api/client-portal/orders?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load orders');
      setOrders(data.orders ?? []);
      setPagination(data.pagination ?? EMPTY_PAGINATION);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [page, status, shippingStage]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (!searchParams) return;
    const orderId = searchParams.get('order');
    if (orderId) void openDetail(orderId);
  }, [searchParams]);

  async function openDetail(id: string) {
    const res = await fetch(`/api/client-portal/orders/${id}`);
    const data = await res.json();
    if (res.ok) setDetail(data.order);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">My orders</h1>
        <p className="mt-1 text-sm text-slate-500">Track parts and shipments for your account</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select value={shippingStage} onChange={(e) => { setPage(1); setShippingStage(e.target.value); }} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="all">All shipping stages</option>
          {SHIPPING_STAGES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {loading && orders.length === 0 ? (
        <LoadingState />
      ) : orders.length === 0 ? (
        <EmptyOrdersState />
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => {
            const trackingUrl = getTrackingUrl(order.trackingNumber, order.vendor);
            return (
              <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-slate-900">{order.title || order.itemName}</h2>
                    <p className="text-sm text-slate-500">
                      Order #<OrderLink id={order.id} label={order.orderNumber} />
                    </p>
                  </div>
                  <StatusBadge status={order.status} />
                </div>

                <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                  <p><span className="text-slate-500">Item:</span> {order.itemName}</p>
                  <p><span className="text-slate-500">Order date:</span> {formatDate(order.orderDate)}</p>
                  {order.estimatedArrival && <p><span className="text-slate-500">ETA:</span> {formatDate(order.estimatedArrival)}</p>}
                  {order.actualArrival && <p><span className="text-slate-500">Delivered:</span> {formatDate(order.actualArrival)}</p>}
                </div>

                {(order.trackingNumber || order.currentLocation || order.shippingStage) && (
                  <div className="mt-4 space-y-3">
                    <ShipmentJourney shippingStage={order.shippingStage} compact />
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-sm">
                    <p className="mb-2 flex items-center gap-2 font-medium text-slate-700">
                      <Truck className="h-4 w-4" />
                      Shipment
                    </p>
                    {order.trackingNumber && (
                      <p className="font-medium">
                        {trackingUrl ? (
                          <a href={trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
                            {order.trackingNumber}
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : (
                          order.trackingNumber
                        )}
                      </p>
                    )}
                    {order.currentLocation && (
                      <p className="mt-2 flex items-center gap-1.5 text-slate-600">
                        <MapPin className="h-3.5 w-3.5" />
                        {order.currentLocation}
                      </p>
                    )}
                    <div className="mt-2">
                      <StageBadge stage={order.shippingStage} />
                    </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <p className="font-semibold text-slate-900">{formatMoney(order.clientPrice)}</p>
                  <button
                    type="button"
                    onClick={() => openDetail(order.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Eye className="h-4 w-4" />
                    Details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-slate-500">Page {pagination.page} of {pagination.pages}</p>
          <div className="flex gap-2">
            <button type="button" disabled={pagination.page <= 1 || loading} onClick={() => setPage((p) => p - 1)} className="rounded-xl border px-3 py-1.5 disabled:opacity-50">Previous</button>
            <button type="button" disabled={pagination.page >= pagination.pages || loading} onClick={() => setPage((p) => p + 1)} className="rounded-xl border px-3 py-1.5 disabled:opacity-50">Next</button>
          </div>
        </div>
      )}

      {detail && <OrderDetailModal order={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
