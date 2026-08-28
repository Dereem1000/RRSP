'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PARTS_ACTIVITY_IDLE_CHECK_MS,
  PARTS_DATA_CHANGED_KEY,
  PARTS_DATA_REFRESH_EVENT,
  PARTS_REFRESH_BURST_DELAYS_MS,
} from '@/lib/parts-live-sync';

type Activity = { version: number; at: string; wakeUntil: string };

type IncomingToast = {
  id: string;
  requestNumber: string;
  itemName: string;
  buyerLabel: string;
  quantity: number;
};

type CancelToast = {
  id: string;
  requestNumber: string;
  itemName: string;
  buyerLabel: string;
  quantity: number;
};

type DeliveryToast = {
  id: string;
  requestNumber: string;
  itemName: string;
  quantity: number;
  status: 'pending_delivery' | 'out_for_delivery';
  etaLabel: string | null;
  paymentRequired?: boolean;
};

type RequestRow = {
  id: string;
  requestNumber: string;
  itemName: string;
  requestedQuantity: number;
  status: string;
  buyerDisplayName?: string;
  buyerName?: string | null;
  deliveryEtaLabel?: string | null;
  billing?: {
    paymentUnpaid?: boolean;
    billingStatus?: string;
  } | null;
};

function notifyPartsPages() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PARTS_DATA_REFRESH_EVENT));
}

/**
 * Portal-wide: idle = tiny activity check only.
 * Any parts button click stamps server activity → both CD and client wake a short full-data burst,
 * then return to idle. Also shows parts toasts outside the Parts page.
 */
export function PartsLiveSync({
  role,
  isAdmin,
}: {
  role: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const lastVersionRef = useRef<number | null>(null);
  const burstIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const seenDeliveryRef = useRef<Record<string, string>>({});

  const [incomingToasts, setIncomingToasts] = useState<IncomingToast[]>([]);
  const [cancelToasts, setCancelToasts] = useState<CancelToast[]>([]);
  const [deliveryToasts, setDeliveryToasts] = useState<DeliveryToast[]>([]);

  const canManageStock = role === 'admin' || role === 'technician' || role === 'client';

  const fetchActivity = useCallback(async (): Promise<Activity | null> => {
    try {
      const res = await fetch('/api/msp/parts-catalog/activity', { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return (data.activity as Activity) ?? null;
    } catch {
      return null;
    }
  }, []);

  const fetchSnapshotAndToasts = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const res = await fetch('/api/msp/parts-catalog?lite=1', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      notifyPartsPages();

      const incoming = (data.requests?.incoming ?? []) as RequestRow[];
      const outgoing = (data.requests?.outgoing ?? []) as RequestRow[];

      if (canManageStock) {
        const pendingIncoming = incoming.filter((r) => r.status === 'pending');
        setIncomingToasts(
          pendingIncoming.map((r) => ({
            id: r.id,
            requestNumber: r.requestNumber,
            itemName: r.itemName,
            buyerLabel: r.buyerDisplayName || r.buyerName || 'Buyer',
            quantity: r.requestedQuantity,
          }))
        );
      } else {
        setIncomingToasts([]);
      }

      if (isAdmin) {
        const cancelRequested = outgoing.filter((r) => r.status === 'cancel_requested');
        setCancelToasts(
          cancelRequested.map((r) => ({
            id: r.id,
            requestNumber: r.requestNumber,
            itemName: r.itemName,
            buyerLabel: r.buyerDisplayName || r.buyerName || 'Buyer',
            quantity: r.requestedQuantity,
          }))
        );
      } else {
        setCancelToasts([]);
      }

      const delivery = outgoing.filter(
        (r) => r.status === 'pending_delivery' || r.status === 'out_for_delivery'
      );
      const nextDelivery: DeliveryToast[] = [];
      for (const r of delivery) {
        const paymentKey = r.billing?.paymentUnpaid ? 'unpaid' : 'ok';
        const seenKey = `${r.status}:${paymentKey}`;
        if (seenDeliveryRef.current[r.id] === seenKey) continue;
        nextDelivery.push({
          id: r.id,
          requestNumber: r.requestNumber,
          itemName: r.itemName,
          quantity: r.requestedQuantity,
          status: r.status as 'pending_delivery' | 'out_for_delivery',
          etaLabel: r.deliveryEtaLabel ?? null,
          paymentRequired: Boolean(r.billing?.paymentUnpaid),
        });
      }
      setDeliveryToasts(nextDelivery);
    } catch {
      // ignore transient errors during burst
    } finally {
      inFlightRef.current = false;
    }
  }, [canManageStock, isAdmin]);

  const startFollowBurst = useCallback(async () => {
    const burstId = ++burstIdRef.current;
    await fetchSnapshotAndToasts();
    for (const delay of PARTS_REFRESH_BURST_DELAYS_MS) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (burstIdRef.current !== burstId) return;
      await fetchSnapshotAndToasts();
    }
  }, [fetchSnapshotAndToasts]);

  // Idle: only check tiny activity endpoint. On version bump → short full burst, then idle again.
  useEffect(() => {
    if (!canManageStock && role !== 'client') return;

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

      const activity = await fetchActivity();
      if (!activity || cancelled) return;

      const version = Number(activity.version) || 0;
      if (lastVersionRef.current === null) {
        lastVersionRef.current = version;
        const wakeMs = activity.wakeUntil ? new Date(activity.wakeUntil).getTime() : 0;
        if (wakeMs > Date.now()) {
          void startFollowBurst();
        }
        return;
      }

      if (version !== lastVersionRef.current) {
        lastVersionRef.current = version;
        void startFollowBurst();
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, PARTS_ACTIVITY_IDLE_CHECK_MS);

    function onStorage(event: StorageEvent) {
      if (event.key !== PARTS_DATA_CHANGED_KEY || !event.newValue) return;
      void startFollowBurst();
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') void tick();
    }

    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      burstIdRef.current += 1;
    };
  }, [canManageStock, role, fetchActivity, startFollowBurst]);

  const hasToasts =
    incomingToasts.length > 0 || cancelToasts.length > 0 || deliveryToasts.length > 0;

  if (!hasToasts) return null;

  const bottomClass =
    role === 'admin'
      ? 'bottom-24 max-lg:bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))]'
      : 'bottom-6';

  return (
    <div
      className={`pointer-events-none fixed right-6 z-[90] flex max-h-[min(70vh,28rem)] w-full max-w-sm flex-col-reverse gap-2 overflow-y-auto ${bottomClass}`}
    >
      {cancelToasts.map((toast) => (
        <div
          key={`cancel-${toast.id}`}
          className="pointer-events-auto rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-950 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">Cancel requested</p>
              <p className="mt-0.5 text-rose-900/80">
                {toast.quantity}× {toast.itemName}
              </p>
              <p className="mt-1 text-xs text-rose-900/60">
                {toast.requestNumber} · {toast.buyerLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/parts?tab=outgoing')}
                className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-200"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => setCancelToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
      {deliveryToasts.map((toast) => (
        <div
          key={`del-${toast.id}-${toast.status}-${toast.paymentRequired ? 'pay' : 'ok'}`}
          className={`pointer-events-auto rounded-2xl border bg-white px-4 py-3 text-sm shadow-xl ${
            toast.paymentRequired
              ? 'border-amber-200 text-amber-950'
              : 'border-sky-200 text-sky-950'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">
                {toast.paymentRequired
                  ? 'Payment required for your parts order'
                  : toast.status === 'pending_delivery'
                    ? 'Ready for delivery'
                    : 'Out for delivery'}
              </p>
              <p
                className={`mt-0.5 ${toast.paymentRequired ? 'text-amber-900/80' : 'text-sky-900/80'}`}
              >
                {toast.quantity}× {toast.itemName}
              </p>
              <p
                className={`mt-1 text-xs ${toast.paymentRequired ? 'text-amber-900/60' : 'text-sky-900/60'}`}
              >
                {toast.requestNumber}
                {toast.etaLabel ? ` · ETA ${toast.etaLabel}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/parts?tab=outgoing')}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  toast.paymentRequired
                    ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                    : 'bg-sky-100 text-sky-900 hover:bg-sky-200'
                }`}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => {
                  seenDeliveryRef.current[toast.id] = `${toast.status}:${
                    toast.paymentRequired ? 'unpaid' : 'ok'
                  }`;
                  setDeliveryToasts((prev) => prev.filter((t) => t.id !== toast.id));
                }}
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
      {incomingToasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-amber-950 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">Incoming parts</p>
              <p className="mt-0.5 text-amber-900/80">
                {toast.quantity}× {toast.itemName}
              </p>
              <p className="mt-1 text-xs text-amber-900/60">
                {toast.requestNumber} · {toast.buyerLabel}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/parts?tab=incoming')}
                className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
              >
                View
              </button>
              <button
                type="button"
                onClick={() => setIncomingToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
