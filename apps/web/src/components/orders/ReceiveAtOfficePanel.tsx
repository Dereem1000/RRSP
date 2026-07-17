'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Loader2, PackageCheck, Search } from 'lucide-react';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import {
  OrderDetailBody,
  StageBadge,
  StatusBadge,
  type OrderView,
} from '@/components/orders/order-ui';
import { ShipmentJourney } from '@/components/orders/ShipmentJourney';
import { BarcodeScannerModal } from '@/components/ui/BarcodeScannerModal';
import { DEFAULT_OFFICE_LOCATION } from '@/lib/order-constants';

export function ReceiveAtOfficePanel({
  onReceived,
}: {
  onReceived?: (order: OrderView) => void;
}) {
  const { askToEmailClient } = useClientEmailPolicy();
  const inputRef = useRef<HTMLInputElement>(null);
  const [serial, setSerial] = useState('');
  const [results, setResults] = useState<OrderView[]>([]);
  const [selected, setSelected] = useState<OrderView | null>(null);
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const search = useCallback(async (queryOverride?: string) => {
    const query = (queryOverride ?? serial).trim();
    if (query.length < 2) {
      setError('Enter at least 2 characters (serial, tracking #, or order #).');
      return;
    }

    setSerial(query);
    setLoading('search');
    setError('');
    setMessage('');
    setSelected(null);

    try {
      const res = await fetch(`/api/msp/orders/receive-lookup?serial=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Search failed');
      setResults(data.orders ?? []);
      if ((data.orders ?? []).length === 0) {
        setMessage('No matching shipments found.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading('');
      inputRef.current?.focus();
    }
  }, [serial]);

  const handleScan = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) return;
      setSerial(trimmed);
      void search(trimmed);
    },
    [search]
  );

  async function markReceived(order: OrderView) {
    const sendEmail = askToEmailClient('Email the client that this shipment arrived at the office?');
    setLoading(`receive-${order.id}`);
    setError('');
    setMessage('');

    try {
      const res = await fetch(`/api/msp/orders/${order.id}/receive-at-office`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serialNumber: serial.trim() || order.serialNumber || undefined,
          sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to mark received');

      setMessage(data.message ?? 'Marked as received at office.');
      setSelected(data.order);
      setResults((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
      onReceived?.(data.order);
      setSerial('');
      setResults([]);
      inputRef.current?.focus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark received');
    } finally {
      setLoading('');
    }
  }

  const alreadyAtOffice = (order: OrderView) => order.shippingStage === 'local_office';

  return (
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-950">
          <PackageCheck className="h-4 w-4" />
          Receive at office
        </h2>
        <p className="mt-1 text-xs text-emerald-900/80">
          Use a USB barcode scanner (focus the field below), tap Scan on mobile to use your camera, or type a serial
          number, tracking #, or order # to find the shipment, then mark it received at {DEFAULT_OFFICE_LOCATION}.
        </p>
      </div>

      <form
        className="mt-4 flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          ref={inputRef}
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          placeholder="Serial / tracking / order #"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          inputMode="text"
          className="min-w-[220px] flex-1 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
        />
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          disabled={!!loading}
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
        >
          <Camera className="h-4 w-4" />
          <span className="hidden sm:inline">Scan</span>
        </button>
        <button
          type="submit"
          disabled={!!loading}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-800 disabled:opacity-60"
        >
          {loading === 'search' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Find shipment
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {message && <p className="mt-3 text-sm text-emerald-900">{message}</p>}

      {results.length > 0 && (
        <ul className="mt-4 space-y-3">
          {results.map((order) => (
            <li key={order.id} className="rounded-xl border border-white bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{order.title}</p>
                  <p className="text-sm text-slate-500">
                    #{order.orderNumber} · {order.itemName}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{order.client?.name ?? '—'}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={order.status} />
                    <StageBadge stage={order.shippingStage} />
                  </div>
                  {order.trackingNumber && (
                    <p className="mt-2 text-xs text-slate-500">Tracking: {order.trackingNumber}</p>
                  )}
                  {order.serialNumber && (
                    <p className="text-xs text-slate-500">Serial: {order.serialNumber}</p>
                  )}
                  {order.currentLocation && (
                    <p className="text-xs text-slate-500">Location: {order.currentLocation}</p>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setSelected(selected?.id === order.id ? null : order)}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    {selected?.id === order.id ? 'Hide' : 'Details'}
                  </button>
                  <button
                    type="button"
                    onClick={() => markReceived(order)}
                    disabled={!!loading || alreadyAtOffice(order)}
                    className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {loading === `receive-${order.id}`
                      ? 'Saving…'
                      : alreadyAtOffice(order)
                        ? 'Already at office'
                        : 'Mark received at office'}
                  </button>
                </div>
              </div>
              {selected?.id === order.id && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <ShipmentJourney shippingStage={order.shippingStage} compact />
                  <div className="mt-4">
                    <OrderDetailBody order={selected} />
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
    </div>
  );
}
