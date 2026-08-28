'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Loader2, Printer, Receipt, Send, CreditCard } from 'lucide-react';
import { InvoiceLink, QuoteLink } from '@/components/links/DocumentLinks';
import { useUrlTab } from '@/lib/use-url-tab';

type Tab = 'invoices' | 'quotes';

const BILLING_TABS: Tab[] = ['invoices', 'quotes'];

type Invoice = {
  id: string;
  invoiceNumber: string;
  amount: number;
  paidAmount?: number;
  currency?: string;
  status: string;
  dueDate: string;
  description?: string | null;
};

type Quote = {
  id: string;
  quoteNumber: string;
  title: string;
  amount: number;
  currency?: string;
  status: string;
  validUntil: string;
  description?: string | null;
  terms?: string | null;
  notes?: string | null;
  items?: Array<{ name: string; description?: string; quantity: number; price: number; total: number }>;
};

type Payment = {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
};

type PaginationMeta = { total: number; page: number; limit: number; pages: number };

const PAGE_SIZE = 20;
const EMPTY_PAGINATION: PaginationMeta = { total: 0, page: 1, limit: PAGE_SIZE, pages: 0 };

const INVOICE_STATUS_COLORS: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-800',
  overdue: 'bg-red-50 text-red-700',
  partial: 'bg-blue-50 text-blue-700',
  cancelled: 'bg-slate-100 text-slate-600',
};

const QUOTE_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  sent: 'bg-blue-50 text-blue-700',
  accepted: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-red-50 text-red-700',
  expired: 'bg-amber-50 text-amber-800',
  converted: 'bg-violet-50 text-violet-700',
};

function formatCurrency(amount: number, currency = 'TTD') {
  return `${currency} ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function openPrintView(path: string) {
  window.open(path, '_blank', 'noopener,noreferrer');
}

export function ClientBillingPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledQuery = useRef<string | null>(null);
  const [tab, setTab] = useUrlTab(BILLING_TABS, 'invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [invoicePagination, setInvoicePagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [quotePagination, setQuotePagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [invoiceStatus, setInvoiceStatus] = useState('all');
  const [quoteStatus, setQuoteStatus] = useState('all');
  const [invoicePage, setInvoicePage] = useState(1);
  const [quotePage, setQuotePage] = useState(1);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [quotesBlocked, setQuotesBlocked] = useState(false);
  const [invoiceDetail, setInvoiceDetail] = useState<Invoice | null>(null);
  const [invoicePayments, setInvoicePayments] = useState<Payment[]>([]);
  const [remainingBalance, setRemainingBalance] = useState(0);
  const [payAvailable, setPayAvailable] = useState(false);
  const [quoteDetail, setQuoteDetail] = useState<Quote | null>(null);

  const loadInvoices = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(invoicePage) });
    if (invoiceStatus !== 'all') params.set('status', invoiceStatus);
    const res = await fetch(`/api/client-portal/invoices?${params}`);
    const data = await res.json();
    if (res.ok) {
      setInvoices(data.invoices ?? []);
      setInvoicePagination(data.pagination ?? EMPTY_PAGINATION);
    }
  }, [invoicePage, invoiceStatus]);

  const loadQuotes = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(quotePage) });
    if (quoteStatus !== 'all') params.set('status', quoteStatus);
    const res = await fetch(`/api/client-portal/quotes?${params}`);
    const data = await res.json();
    if (res.status === 403) {
      setQuotesBlocked(true);
      setQuotes([]);
      return;
    }
    if (res.ok) {
      setQuotesBlocked(false);
      setQuotes(data.quotes ?? []);
      setQuotePagination(data.pagination ?? EMPTY_PAGINATION);
    }
  }, [quotePage, quoteStatus]);

  useEffect(() => {
    setLoading('load');
    Promise.all([loadInvoices(), loadQuotes()])
      .catch(() => setError('Failed to load billing data'))
      .finally(() => setLoading(''));
  }, [loadInvoices, loadQuotes]);

  const clearBillingUrl = useCallback(() => {
    router.replace(`/billing?tab=${tab}`, { scroll: false });
  }, [router, tab]);

  useEffect(() => {
    if (!searchParams) return;
    const query = searchParams.toString();
    if (!query) {
      handledQuery.current = null;
      return;
    }
    if (handledQuery.current === query) return;
    handledQuery.current = query;

    const invoiceId = searchParams.get('invoice');
    const quoteId = searchParams.get('quote');
    const payment = searchParams.get('payment');
    const paymentMessage = searchParams.get('message');

    if (payment === 'success') setMessage('Payment received. Thank you!');
    else if (payment === 'duplicate') setMessage('This payment was already recorded.');
    else if (payment === 'failed') {
      setError(paymentMessage ? decodeURIComponent(paymentMessage) : 'Payment was not completed.');
    }

    if (invoiceId) {
      setTab('invoices');
      void openInvoice(invoiceId);
    } else if (quoteId) {
      setTab('quotes');
      void openQuote(quoteId);
    }

    if (invoiceId || quoteId || payment || paymentMessage) {
      clearBillingUrl();
    }
  }, [searchParams, clearBillingUrl]);

  async function openInvoice(id: string) {
    setLoading(`inv-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/client-portal/invoices/${id}/payments`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setInvoiceDetail(data.invoice);
      setInvoicePayments(data.payments ?? []);
      setRemainingBalance(Number(data.remainingBalance ?? 0));
      setPayAvailable(Boolean(data.payAvailable));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice');
    } finally {
      setLoading('');
    }
  }

  async function openQuote(id: string) {
    setLoading(`quote-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/client-portal/quotes/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setQuoteDetail(data.quote);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quote');
    } finally {
      setLoading('');
    }
  }

  async function payInvoice(id: string) {
    setLoading(`pay-${id}`);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/client-portal/invoices/${id}/pay`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Could not start payment');
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start payment');
      setLoading('');
    }
  }

  async function acceptQuote(id: string) {
    if (!confirm('Accept this quote?')) return;
    setLoading(`accept-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/client-portal/quotes/${id}/accept`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote accepted');
      setQuoteDetail(null);
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept quote');
    } finally {
      setLoading('');
    }
  }

  async function declineQuote(id: string) {
    const reason = prompt('Reason for declining (optional):') ?? '';
    setLoading(`decline-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/client-portal/quotes/${id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote declined');
      setQuoteDetail(null);
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to decline quote');
    } finally {
      setLoading('');
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: 'invoices', label: 'Invoices', icon: Receipt },
    { id: 'quotes', label: 'Quotes', icon: Send },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Billing</h1>
        <p className="mt-1 text-sm text-slate-500">View your invoices and quotes</p>
      </div>

      {(error || message) && (
        <div className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'invoices' && (
        <div className="space-y-4">
          <select
            value={invoiceStatus}
            onChange={(e) => { setInvoicePage(1); setInvoiceStatus(e.target.value); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">All statuses</option>
            {['pending', 'paid', 'overdue', 'partial', 'cancelled'].map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {loading === 'load' ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
            <>
              <BillingTable
                empty="No invoices found"
                headers={['Invoice', 'Amount', 'Due', 'Status', '']}
                rows={invoices.map((inv) => [
                  <InvoiceLink key={inv.id} id={inv.id} label={inv.invoiceNumber} portal="client" />,
                  formatCurrency(inv.amount, inv.currency),
                  String(inv.dueDate).slice(0, 10),
                  <StatusBadge key={inv.id} status={inv.status} colors={INVOICE_STATUS_COLORS} />,
                  <button key={`v-${inv.id}`} type="button" onClick={() => openInvoice(inv.id)} className="text-xs font-semibold text-indigo-600 hover:underline">
                    View
                  </button>,
                ])}
              />
              <PaginationBar page={invoicePagination.page} pages={invoicePagination.pages} total={invoicePagination.total} onPageChange={setInvoicePage} />
            </>
          )}
        </div>
      )}

      {tab === 'quotes' && (
        <div className="space-y-4">
          {quotesBlocked ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Quotes are not available on your current service plan. Contact support to upgrade.
            </div>
          ) : (
            <>
              <select
                value={quoteStatus}
                onChange={(e) => { setQuotePage(1); setQuoteStatus(e.target.value); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <option value="all">All statuses</option>
                {['sent', 'accepted', 'rejected', 'expired', 'converted'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <BillingTable
                empty="No quotes found"
                headers={['Quote', 'Title', 'Amount', 'Valid until', 'Status', '']}
                rows={quotes.map((q) => [
                  <QuoteLink key={q.id} id={q.id} label={q.quoteNumber} portal="client" />,
                  q.title,
                  formatCurrency(q.amount, q.currency),
                  String(q.validUntil).slice(0, 10),
                  <StatusBadge key={q.id} status={q.status} colors={QUOTE_STATUS_COLORS} />,
                  <button key={`v-${q.id}`} type="button" onClick={() => openQuote(q.id)} className="text-xs font-semibold text-indigo-600 hover:underline">
                    View
                  </button>,
                ])}
              />
              <PaginationBar page={quotePagination.page} pages={quotePagination.pages} total={quotePagination.total} onPageChange={setQuotePage} />
            </>
          )}
        </div>
      )}

      {invoiceDetail && (
        <Modal
          title={`Invoice ${invoiceDetail.invoiceNumber}`}
          onClose={() => {
            setInvoiceDetail(null);
            clearBillingUrl();
          }}
        >
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-xs uppercase text-slate-400">Amount</p><p className="font-semibold">{formatCurrency(invoiceDetail.amount, invoiceDetail.currency)}</p></div>
              <div><p className="text-xs uppercase text-slate-400">Status</p><StatusBadge status={invoiceDetail.status} colors={INVOICE_STATUS_COLORS} /></div>
              <div><p className="text-xs uppercase text-slate-400">Due date</p><p>{String(invoiceDetail.dueDate).slice(0, 10)}</p></div>
              <div><p className="text-xs uppercase text-slate-400">Balance due</p><p className="font-semibold">{formatCurrency(remainingBalance, invoiceDetail.currency)}</p></div>
            </div>
            {invoiceDetail.description && <p className="text-slate-600">{invoiceDetail.description}</p>}
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">Payment history</p>
              {invoicePayments.length === 0 ? (
                <p className="text-slate-500">No payments recorded yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {invoicePayments.map((p) => (
                    <li key={p.id} className="flex justify-between px-4 py-3">
                      <span>{String(p.paymentDate).slice(0, 10)} · {p.paymentMethod}</span>
                      <span className="font-semibold">{formatCurrency(p.amount, invoiceDetail.currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              {payAvailable && invoiceDetail.status !== 'paid' && remainingBalance > 0 && (
                <button
                  type="button"
                  onClick={() => payInvoice(invoiceDetail.id)}
                  disabled={loading === `pay-${invoiceDetail.id}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {loading === `pay-${invoiceDetail.id}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  Pay {formatCurrency(remainingBalance, invoiceDetail.currency)}
                </button>
              )}
              <button
                type="button"
                onClick={() => openPrintView(`/api/client-portal/invoices/${invoiceDetail.id}/print`)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium"
              >
                <Printer className="h-4 w-4" />
                Print / Save as PDF
              </button>
            </div>
          </div>
        </Modal>
      )}

      {quoteDetail && (
        <Modal
          title={`Quote ${quoteDetail.quoteNumber}`}
          wide
          onClose={() => {
            setQuoteDetail(null);
            clearBillingUrl();
          }}
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between">
              <StatusBadge status={quoteDetail.status} colors={QUOTE_STATUS_COLORS} />
              <span className="font-semibold">{formatCurrency(quoteDetail.amount, quoteDetail.currency)}</span>
            </div>
            <p className="font-medium text-slate-900">{quoteDetail.title}</p>
            <p className="text-slate-500">Valid until {String(quoteDetail.validUntil).slice(0, 10)}</p>
            {quoteDetail.description && <p>{quoteDetail.description}</p>}
            {(quoteDetail.items?.length ?? 0) > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {quoteDetail.items!.map((item, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.total ?? item.quantity * item.price, quoteDetail.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {quoteDetail.terms && <div><p className="text-xs uppercase text-slate-400">Terms</p><p>{quoteDetail.terms}</p></div>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => openPrintView(`/api/client-portal/quotes/${quoteDetail.id}/print`)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium"
              >
                <Printer className="h-4 w-4" />
                Print / Save as PDF
              </button>
              {quoteDetail.status === 'sent' && (
                <>
                  <button type="button" onClick={() => acceptQuote(quoteDetail.id)} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Accept quote</button>
                  <button type="button" onClick={() => declineQuote(quoteDetail.id)} className="rounded-xl border px-4 py-2 text-sm">Decline</button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[status] ?? 'bg-slate-100 text-slate-600'}`}>{status}</span>
  );
}

function BillingTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead><tr className="border-b border-slate-100 bg-slate-50/80">{headers.map((h) => <th key={h} className="px-4 py-3 font-semibold text-slate-600">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-5 py-12 text-center text-slate-400">{empty}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/50">{row.map((cell, j) => <td key={j} className="px-4 py-3 text-slate-700">{cell}</td>)}</tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function PaginationBar({ page, pages, total, onPageChange }: { page: number; pages: number; total: number; onPageChange: (p: number) => void }) {
  if (total === 0) return null;
  const safePages = Math.max(pages, 1);
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <span className="text-slate-500">{total} result{total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button>
        <span>Page {page} of {safePages}</span>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= safePages} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button>
      </div>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
