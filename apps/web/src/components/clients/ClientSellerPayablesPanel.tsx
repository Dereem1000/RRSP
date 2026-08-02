'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';

type Payable = {
  id: string;
  sellerAmount: number;
  payoutTotal?: number;
  listedLineTotal?: number;
  cdMarkupAmount: number;
  markupPercent?: number | null;
  status: 'owed' | 'paid_out';
  buyerInvoiceId: string;
  buyerInvoiceNumber?: string | null;
  buyerInvoiceAmount?: number | null;
  deliveryPackageId: string;
  buyerPaidAt: string | null;
  paidOutAt: string | null;
  notes: string | null;
  rrspInvoiceId: string | null;
  creditNoteId?: string | null;
  creditNoteNumber?: string | null;
  buyerName: string | null;
};

type Totals = {
  owed: number;
  paidOut: number;
  countOwed: number;
  countPaidOut: number;
};

function formatMoney(n: number) {
  return `TTD ${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function ClientSellerPayablesPanel({
  clientId,
  canManage,
}: {
  clientId: string;
  canManage: boolean;
}) {
  const [payables, setPayables] = useState<Payable[]>([]);
  const [totals, setTotals] = useState<Totals>({
    owed: 0,
    paidOut: 0,
    countOwed: 0,
    countPaidOut: 0,
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/clients/${clientId}/parts-seller-payables?status=all`, {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || 'Failed to load seller payables');
      }
      setPayables(data.payables ?? []);
      setTotals(
        data.totals ?? { owed: 0, paidOut: 0, countOwed: 0, countPaidOut: 0 }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load seller payables');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markPaidOut(id: string) {
    if (!window.confirm('Mark this seller payable as paid out?')) return;
    setSubmitting(id);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/msp/parts-seller-payables/${id}/mark-paid-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || 'Failed to mark paid out');
      }
      setMessage('Payable marked paid out.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark paid out');
    } finally {
      setSubmitting('');
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">Payments owed (parts marketplace)</h2>
          <p className="mt-1 text-sm text-slate-500">
            Seller share from marketplace sales after the buyer pays CD. Mark paid out when you
            remit to this client.
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold text-amber-800">Owed {formatMoney(totals.owed)}</p>
          <p className="text-slate-500">
            {totals.countOwed} open · {totals.countPaidOut} paid out ({formatMoney(totals.paidOut)})
          </p>
        </div>
      </div>

      {(error || message) && (
        <div
          className={`mt-4 rounded-xl px-3 py-2 text-sm ${
            error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || message}
        </div>
      )}

      {loading ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payables…
        </div>
      ) : !payables.length ? (
        <p className="mt-6 text-sm text-slate-500">No marketplace payables for this client yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Payout total</th>
                <th className="px-2 py-2 font-medium">Listed (buyer)</th>
                <th className="px-2 py-2 font-medium">CD markup</th>
                <th className="px-2 py-2 font-medium">Buyer paid</th>
                <th className="px-2 py-2 font-medium">Buyer invoice</th>
                <th className="px-2 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payables.map((row) => {
                const payout = Number(row.payoutTotal ?? row.sellerAmount) || 0;
                const listed =
                  Number(row.listedLineTotal) ||
                  Math.round((payout + (Number(row.cdMarkupAmount) || 0)) * 100) / 100;
                return (
                <tr key={row.id}>
                  <td className="px-2 py-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        row.status === 'owed'
                          ? 'bg-amber-50 text-amber-800'
                          : 'bg-emerald-50 text-emerald-800'
                      }`}
                    >
                      {row.status === 'owed' ? 'Owed' : 'Paid out'}
                    </span>
                    {row.rrspInvoiceId && (
                      <p className="mt-1 text-xs text-slate-400">Mirrored to shop books</p>
                    )}
                    {row.status === 'paid_out' && row.creditNoteNumber && (
                      <p className="mt-1 text-xs font-medium text-emerald-700">
                        Profit {row.creditNoteNumber}
                        {row.markupPercent != null
                          ? ` · ${Number(row.markupPercent).toFixed(1)}%`
                          : ''}
                        {row.cdMarkupAmount > 0 ? ` (${formatMoney(row.cdMarkupAmount)})` : ''}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <p className="font-semibold text-amber-900">{formatMoney(payout)}</p>
                    <p className="text-xs text-slate-400">Remit to seller</p>
                  </td>
                  <td className="px-2 py-3 text-slate-600">
                    {formatMoney(listed)}
                    {row.buyerInvoiceAmount != null && (
                      <p className="text-xs text-slate-400">
                        Invoice {formatMoney(row.buyerInvoiceAmount)}
                      </p>
                    )}
                  </td>
                  <td className="px-2 py-3 text-slate-600">{formatMoney(row.cdMarkupAmount)}</td>
                  <td className="px-2 py-3 text-slate-600">{formatDate(row.buyerPaidAt)}</td>
                  <td className="px-2 py-3">
                    <Link
                      href={`/accounting?tab=invoices&invoice=${row.buyerInvoiceId}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {row.buyerInvoiceNumber || 'View invoice'}
                    </Link>
                    {row.buyerName && (
                      <p className="text-xs text-slate-400">Buyer {row.buyerName}</p>
                    )}
                  </td>
                  <td className="px-2 py-3 text-right">
                    {canManage && row.status === 'owed' && (
                      <button
                        type="button"
                        disabled={submitting === row.id}
                        onClick={() => void markPaidOut(row.id)}
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                      >
                        {submitting === row.id ? 'Saving…' : 'Mark paid out'}
                      </button>
                    )}
                    {row.status === 'paid_out' && (
                      <span className="text-xs text-slate-400">{formatDate(row.paidOutAt)}</span>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
