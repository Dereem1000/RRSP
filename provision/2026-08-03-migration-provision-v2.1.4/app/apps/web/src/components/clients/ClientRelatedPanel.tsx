'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { TicketStatusBadge } from '@/components/tickets/TicketStatusBadge';
import { InvoiceLink, OrderLink, QuoteLink, TicketLink } from '@/components/links/DocumentLinks';

type RelatedData = {
  activities: Array<{
    id: number;
    description: string;
    status: string;
    clock_in_time: string;
    technician: string;
  }>;
  invoices: Array<{
    id: string;
    invoice_number: string;
    amount: number;
    status: string;
    due_date: string;
  }>;
  orders: Array<{
    id: string;
    orderNumber: string;
    title: string;
    status: string;
    totalAmount: number | null;
  }>;
  quotes: Array<{
    id: string;
    quote_number: string;
    title: string;
    status: string;
    amount: number;
  }>;
};

const tabs = ['tickets', 'activities', 'invoices', 'orders', 'quotes'] as const;

export function ClientRelatedPanel({
  clientId,
  tickets,
}: {
  clientId: string;
  tickets: Array<{
    id: string;
    ticketNumber: string;
    issue: string;
    status: string;
  }>;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>('tickets');
  const [data, setData] = useState<RelatedData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (tab === 'tickets') return;
    setLoading(true);
    fetch(`/api/clients/${clientId}/related`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json);
      })
      .finally(() => setLoading(false));
  }, [clientId, tab]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-4">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition ${
              tab === t ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        {tab === 'tickets' &&
          (tickets.length === 0 ? (
            <Empty label="No tickets" />
          ) : (
            tickets.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3"
              >
                <div>
                  <TicketLink id={t.id} label={t.ticketNumber} />
                  <p className="text-sm text-slate-800">{t.issue}</p>
                </div>
                <TicketStatusBadge status={t.status} />
              </div>
            ))
          ))}

        {tab !== 'tickets' && loading && (
          <div className="flex justify-center py-8 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {tab === 'activities' && !loading && (
          !data?.activities.length ? (
            <Empty label="No activities" />
          ) : (
            data.activities.map((a) => (
              <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <p className="text-sm text-slate-800">{a.description || 'Activity'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {a.technician} · {a.status} · {a.clock_in_time}
                </p>
              </div>
            ))
          )
        )}

        {tab === 'invoices' && !loading && (
          !data?.invoices.length ? (
            <Empty label="No invoices" />
          ) : (
            data.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <div>
                  <InvoiceLink id={inv.id} label={inv.invoice_number} />
                  <p className="text-sm text-slate-800">TTD {inv.amount}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{inv.status}</span>
              </div>
            ))
          )
        )}

        {tab === 'orders' && !loading && (
          !data?.orders.length ? (
            <Empty label="No orders" />
          ) : (
            data.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <div>
                  <OrderLink id={o.id} label={o.orderNumber} />
                  <p className="text-sm text-slate-800">{o.title}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{o.status}</span>
              </div>
            ))
          )
        )}

        {tab === 'quotes' && !loading && (
          !data?.quotes.length ? (
            <Empty label="No quotes" />
          ) : (
            data.quotes.map((q) => (
              <div key={q.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                <div>
                  <QuoteLink id={q.id} label={q.quote_number} />
                  <p className="text-sm text-slate-800">{q.title}</p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-600">{q.status}</span>
              </div>
            ))
          )
        )}
      </div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-8 text-center text-sm text-slate-400">{label}</p>;
}
