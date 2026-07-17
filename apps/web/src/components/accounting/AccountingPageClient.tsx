'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRightLeft,
  Ban,
  Check,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Link2,
  Loader2,
  Mail,
  Printer,
  Receipt,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { ClientSearchSelect } from '@/components/clients/ClientSearchSelect';
import { EmailSentHistory } from '@/components/accounting/EmailSentHistory';
import { InvoiceLinksSection, type InvoiceLinkView } from '@/components/accounting/InvoiceLinksSection';
import { ACCOUNTING_HEADER_EVENTS } from '@/components/accounting/AccountingHeaderActions';
import { StatCard } from '@/components/dashboard/StatCard';
import { ClientLink, InvoiceLink, QuoteLink } from '@/components/links/DocumentLinks';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import type { AccountingSummary, RecentFinancialTransaction } from '@/lib/accounting';
import type { EmailLogEntry } from '@/lib/email-log';
import { useUrlTab } from '@/lib/use-url-tab';
import {
  buildTicketAccountingPrefill,
  type TicketAccountingPrefill,
} from '@/lib/ticket-accounting-prefill';

type Tab = 'overview' | 'invoices' | 'quotes';

const ACCOUNTING_TABS: Tab[] = ['overview', 'invoices', 'quotes'];

type Invoice = {
  id: string;
  clientId?: string;
  invoiceNumber: string;
  amount: number;
  paidAmount?: number;
  currency?: string;
  status: string;
  dueDate: string;
  paidDate?: string | null;
  client?: { id?: string; name?: string; email?: string; serviceLevel?: string };
  description?: string | null;
  items?: QuoteLineItem[];
};

type Payment = {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
};

type QuoteLineItem = {
  name: string;
  description?: string;
  quantity: number;
  price: number;
  total: number;
};

type Quote = {
  id: string;
  clientId?: string;
  quoteNumber: string;
  title: string;
  amount: number;
  currency?: string;
  status: string;
  validUntil: string;
  description?: string | null;
  terms?: string | null;
  notes?: string | null;
  items?: QuoteLineItem[];
  client?: { id?: string; name?: string; email?: string };
};

type QuoteSettings = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyWebsite: string;
  companyLogo: string;
  taxRate: number;
  currency: string;
  paymentTerms: string;
  warrantyTerms: string;
  closingMessage: string;
};

import type { ClientPickerOption } from '@/lib/client-picker';

type ClientOption = ClientPickerOption;

type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  pages: number;
};

const PAGE_SIZE = 20;

const EMPTY_PAGINATION: PaginationMeta = { total: 0, page: 1, limit: PAGE_SIZE, pages: 0 };

function sumItems(items: QuoteLineItem[]) {
  return Math.round(items.reduce((sum, item) => sum + item.quantity * item.price, 0) * 100) / 100;
}

function emptyLineItem(): QuoteLineItem {
  return { name: '', description: '', quantity: 1, price: 0, total: 0 };
}

function formatCurrency(amount: number, currency = 'TTD') {
  return `${currency} ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function invoiceOutstanding(amount: number, paidAmount = 0) {
  return Math.max(0, Math.round((Number(amount) - Number(paidAmount ?? 0)) * 100) / 100);
}

function InvoiceAmountCell({
  amount,
  paidAmount = 0,
  currency = 'TTD',
}: {
  amount: number;
  paidAmount?: number;
  currency?: string;
}) {
  const total = Number(amount);
  const paid = Number(paidAmount ?? 0);
  const outstanding = invoiceOutstanding(total, paid);
  const isPartial = paid > 0 && outstanding > 0.009;

  if (isPartial) {
    return (
      <div className="min-w-[8.5rem]">
        <p className="font-semibold text-amber-800">
          {formatCurrency(outstanding, currency)}{' '}
          <span className="text-xs font-medium text-amber-700/90">outstanding</span>
        </p>
        <p className="text-xs text-slate-500">
          {formatCurrency(paid, currency)} paid · {formatCurrency(total, currency)} total
        </p>
      </div>
    );
  }

  return <span className="font-medium text-slate-900">{formatCurrency(total, currency)}</span>;
}

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

export function AccountingPageClient({
  isAdmin,
  clients,
}: {
  isAdmin: boolean;
  clients: ClientOption[];
}) {
  const searchParams = useSearchParams();
  const { confirmBeforeClientEmail, askToEmailClient } = useClientEmailPolicy();
  const [tab, setTab] = useUrlTab(ACCOUNTING_TABS, 'overview');
  const [summary, setSummary] = useState<AccountingSummary | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<RecentFinancialTransaction[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('all');
  const [quoteStatus, setQuoteStatus] = useState('all');
  const [invoiceClientId, setInvoiceClientId] = useState('all');
  const [quoteClientId, setQuoteClientId] = useState('all');
  const [invoicePage, setInvoicePage] = useState(1);
  const [quotePage, setQuotePage] = useState(1);
  const [invoicePagination, setInvoicePagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [quotePagination, setQuotePagination] = useState<PaginationMeta>(EMPTY_PAGINATION);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [createQuoteClientId, setCreateQuoteClientId] = useState('');
  const [createInvoiceClientId, setCreateInvoiceClientId] = useState('');
  const [convertQuoteId, setConvertQuoteId] = useState<string | null>(null);
  const [convertDueDate, setConvertDueDate] = useState('');
  const [invoiceDetailId, setInvoiceDetailId] = useState<string | null>(null);
  const [invoiceDetail, setInvoiceDetail] = useState<Invoice | null>(null);
  const [invoiceEditing, setInvoiceEditing] = useState(false);
  const [editInvoiceAmount, setEditInvoiceAmount] = useState('');
  const [editInvoiceDueDate, setEditInvoiceDueDate] = useState('');
  const [editInvoiceDescription, setEditInvoiceDescription] = useState('');
  const [editInvoiceItems, setEditInvoiceItems] = useState<QuoteLineItem[]>([]);
  const [invoicePayments, setInvoicePayments] = useState<Payment[]>([]);
  const [invoiceEmailHistory, setInvoiceEmailHistory] = useState<EmailLogEntry[]>([]);
  const [invoiceLinks, setInvoiceLinks] = useState<InvoiceLinkView[]>([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'paypal' | 'bank_transfer'>('CASH');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [quoteDetailId, setQuoteDetailId] = useState<string | null>(null);
  const [quoteDetail, setQuoteDetail] = useState<Quote | null>(null);
  const [quoteEmailHistory, setQuoteEmailHistory] = useState<EmailLogEntry[]>([]);
  const [quoteEditing, setQuoteEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTerms, setEditTerms] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editItems, setEditItems] = useState<QuoteLineItem[]>([]);
  const [createItems, setCreateItems] = useState<QuoteLineItem[]>([emptyLineItem()]);
  const [ticketPrefill, setTicketPrefill] = useState<TicketAccountingPrefill | null>(null);
  const [formPrefillKey, setFormPrefillKey] = useState(0);
  const [showQuoteSettings, setShowQuoteSettings] = useState(false);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings | null>(null);

  function resetCreateForms() {
    setCreateQuoteClientId('');
    setCreateInvoiceClientId('');
    setTicketPrefill(null);
    setCreateItems([emptyLineItem()]);
    setFormPrefillKey(0);
  }

  useEffect(() => {
    if (!isAdmin || !searchParams) return;

    const create = searchParams.get('create');
    const clientIdParam = searchParams.get('clientId');
    const ticketIdParam = searchParams.get('ticketId');
    if (create !== 'quote' && create !== 'invoice') return;

    async function applyCreateParams() {
      let prefill: TicketAccountingPrefill | null = null;
      if (ticketIdParam) {
        try {
          const res = await fetch(`/api/tickets/${ticketIdParam}`);
          const data = await res.json();
          if (res.ok && data.ticket) {
            prefill = buildTicketAccountingPrefill(data.ticket);
          }
        } catch {
          // Ignore ticket prefill errors; client selection still works.
        }
      }

      const clientId = prefill?.clientId ?? clientIdParam ?? '';
      if (prefill) {
        setTicketPrefill(prefill);
        if (prefill.lineItems?.length) setCreateItems(prefill.lineItems);
        setFormPrefillKey((key) => key + 1);
      }

      if (create === 'quote') {
        setShowQuoteForm(true);
        if (clientId) setCreateQuoteClientId(clientId);
      }
      if (create === 'invoice') {
        setShowInvoiceForm(true);
        if (clientId) setCreateInvoiceClientId(clientId);
      }
    }

    void applyCreateParams();
  }, [searchParams, isAdmin]);

  useEffect(() => {
    if (!searchParams) return;
    const invoiceId = searchParams.get('invoice');
    const quoteId = searchParams.get('quote');
    if (invoiceId) {
      setTab('invoices');
      void openInvoiceDetail(invoiceId);
    } else if (quoteId) {
      setTab('quotes');
      void openQuoteDetail(quoteId);
    }
  }, [searchParams]);

  const loadSummary = useCallback(async () => {
    const res = await fetch('/api/accounting/summary');
    const data = await res.json();
    if (res.ok) {
      setSummary(data.summary);
      setRecentTransactions(data.recentTransactions ?? []);
    }
  }, []);

  const loadInvoices = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(invoicePage) });
    if (invoiceStatus !== 'all') params.set('status', invoiceStatus);
    if (invoiceClientId !== 'all') params.set('clientId', invoiceClientId);
    const res = await fetch(`/api/msp/invoices?${params}`);
    const data = await res.json();
    if (res.ok) {
      setInvoices(data.invoices ?? []);
      setInvoicePagination(data.pagination ?? EMPTY_PAGINATION);
    } else {
      setError(data.message || 'Failed to load invoices');
    }
  }, [invoiceStatus, invoiceClientId, invoicePage]);

  const loadQuotes = useCallback(async () => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(quotePage) });
    if (quoteStatus !== 'all') params.set('status', quoteStatus);
    if (quoteClientId !== 'all') params.set('clientId', quoteClientId);
    const res = await fetch(`/api/msp/quotes?${params}`);
    const data = await res.json();
    if (res.ok) {
      setQuotes(data.quotes ?? []);
      setQuotePagination(data.pagination ?? EMPTY_PAGINATION);
    } else {
      setError(data.message || 'Failed to load quotes');
    }
  }, [quoteStatus, quoteClientId, quotePage]);

  const refresh = useCallback(async () => {
    setLoading('refresh');
    setError('');
    try {
      await Promise.all([loadSummary(), loadInvoices(), loadQuotes()]);
    } catch {
      setError('Failed to refresh accounting data');
    } finally {
      setLoading('');
    }
  }, [loadSummary, loadInvoices, loadQuotes]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (tab === 'invoices') loadInvoices();
  }, [tab, loadInvoices]);

  useEffect(() => {
    if (tab === 'quotes') loadQuotes();
  }, [tab, loadQuotes]);

  useEffect(() => {
    async function onQuoteSettings() {
      setShowQuoteSettings(true);
      await loadQuoteSettings();
    }

    function onNewQuote() {
      setShowQuoteForm(true);
    }

    function onNewInvoice() {
      setShowInvoiceForm(true);
    }

    async function onRefresh() {
      await refresh();
      window.dispatchEvent(new CustomEvent(ACCOUNTING_HEADER_EVENTS.REFRESH_COMPLETE));
    }

    window.addEventListener(ACCOUNTING_HEADER_EVENTS.NEW_QUOTE, onNewQuote);
    window.addEventListener(ACCOUNTING_HEADER_EVENTS.NEW_INVOICE, onNewInvoice);
    window.addEventListener(ACCOUNTING_HEADER_EVENTS.QUOTE_SETTINGS, onQuoteSettings);
    window.addEventListener(ACCOUNTING_HEADER_EVENTS.REFRESH, onRefresh);

    return () => {
      window.removeEventListener(ACCOUNTING_HEADER_EVENTS.NEW_QUOTE, onNewQuote);
      window.removeEventListener(ACCOUNTING_HEADER_EVENTS.NEW_INVOICE, onNewInvoice);
      window.removeEventListener(ACCOUNTING_HEADER_EVENTS.QUOTE_SETTINGS, onQuoteSettings);
      window.removeEventListener(ACCOUNTING_HEADER_EVENTS.REFRESH, onRefresh);
    };
  }, [refresh]);

  async function markPaid(id: string) {
    if (!confirm('Mark this invoice as paid?')) return;
    const sendEmail = askToEmailClient('Send a payment confirmation email to the client?');
    setLoading(`paid-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/invoices/${id}/mark-paid`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Invoice marked as paid');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark paid');
    } finally {
      setLoading('');
    }
  }

  async function openInvoiceDetail(id: string) {
    setLoading(`inv-${id}`);
    setError('');
    try {
      const [invRes, payRes, emailRes, linksRes] = await Promise.all([
        fetch(`/api/msp/invoices/${id}`),
        fetch(`/api/msp/invoices/${id}/payments`),
        fetch(`/api/msp/invoices/${id}/email-history`),
        fetch(`/api/msp/invoices/${id}/links`),
      ]);
      const invData = await invRes.json();
      const payData = await payRes.json();
      const emailData = await emailRes.json();
      const linksData = await linksRes.json();
      if (!invRes.ok) throw new Error(invData.message || 'Failed to load invoice');
      if (!payRes.ok) throw new Error(payData.message || 'Failed to load payments');
      const invoice = invData.invoice as Invoice;
      setInvoiceDetail(invoice);
      setInvoicePayments(payData.payments ?? []);
      setInvoiceEmailHistory(emailRes.ok ? (emailData.logs ?? []) : []);
      setInvoiceLinks(linksRes.ok ? (linksData.links ?? []) : []);
      setInvoiceDetailId(id);
      setInvoiceEditing(false);
      setEditInvoiceAmount(String(invoice.amount));
      setEditInvoiceDueDate(String(invoice.dueDate).slice(0, 10));
      setEditInvoiceDescription(invoice.description ?? '');
      setEditInvoiceItems((invoice.items ?? []).length ? (invoice.items as QuoteLineItem[]) : [emptyLineItem()]);
      setPaymentAmount('');
      setPaymentReference('');
      setPaymentNotes('');
      setPaymentMethod('CASH');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invoice');
    } finally {
      setLoading('');
    }
  }

  async function saveInvoiceEdit() {
    if (!invoiceDetailId) return;
    const items = editInvoiceItems
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        total: (Number(item.quantity) || 1) * (Number(item.price) || 0),
      }));
    const amount = items.length ? sumItems(items) : Number(editInvoiceAmount);
    setLoading(`save-inv-${invoiceDetailId}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/invoices/${invoiceDetailId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          dueDate: editInvoiceDueDate,
          description: editInvoiceDescription || null,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Invoice updated');
      setInvoiceEditing(false);
      await openInvoiceDetail(invoiceDetailId);
      await loadInvoices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update invoice');
    } finally {
      setLoading('');
    }
  }

  async function addPayment() {
    if (!invoiceDetailId) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid payment amount');
      return;
    }
    const sendEmail = askToEmailClient('Email the client about this payment?');
    setLoading(`addpay-${invoiceDetailId}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/invoices/${invoiceDetailId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          paymentMethod,
          reference: paymentReference || undefined,
          notes: paymentNotes || undefined,
          sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Payment added');
      await openInvoiceDetail(invoiceDetailId);
      await loadInvoices();
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add payment');
    } finally {
      setLoading('');
    }
  }

  function printDocument(path: string) {
    window.open(path, '_blank', 'noopener,noreferrer');
  }

  async function copyShareLink(kind: 'invoice' | 'quote', id: string) {
    setLoading(`share-${kind}-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/${kind === 'invoice' ? 'invoices' : 'quotes'}/${id}/share-link`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create share link');
      await navigator.clipboard.writeText(data.viewUrl);
      setMessage(`${kind === 'invoice' ? 'Invoice' : 'Quote'} link copied (expires in ${data.expiresIn})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to copy share link');
    } finally {
      setLoading('');
    }
  }

  async function removePayment(paymentId: string) {
    if (!confirm('Delete this payment?')) return;
    setLoading(`delpay-${paymentId}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/payments/${paymentId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Payment deleted');
      if (invoiceDetailId) await openInvoiceDetail(invoiceDetailId);
      await loadInvoices();
      await loadSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment');
    } finally {
      setLoading('');
    }
  }

  async function cancelInvoice(id: string) {
    if (!confirm('Cancel this invoice?')) return;
    setLoading(`cancel-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/invoices/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Invoice cancelled');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel invoice');
    } finally {
      setLoading('');
    }
  }

  async function deleteInvoice(id: string) {
    if (!confirm('Delete this invoice?')) return;
    setLoading(`delete-inv-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/invoices/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Invoice deleted');
      setInvoiceDetailId(null);
      setInvoiceDetail(null);
      setInvoicePayments([]);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invoice');
    } finally {
      setLoading('');
    }
  }

  async function openQuoteDetail(id: string) {
    setLoading(`quote-${id}`);
    setError('');
    try {
      const [res, emailRes] = await Promise.all([
        fetch(`/api/msp/quotes/${id}`),
        fetch(`/api/msp/quotes/${id}/email-history`),
      ]);
      const data = await res.json();
      const emailData = await emailRes.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load quote');
      const quote = data.quote as Quote;
      setQuoteDetail(quote);
      setQuoteDetailId(id);
      setQuoteEmailHistory(emailRes.ok ? (emailData.logs ?? []) : []);
      setQuoteEditing(false);
      setEditTitle(quote.title);
      setEditAmount(String(quote.amount));
      setEditValidUntil(String(quote.validUntil).slice(0, 10));
      setEditDescription(quote.description ?? '');
      setEditTerms(quote.terms ?? '');
      setEditNotes(quote.notes ?? '');
      setEditItems((quote.items ?? []).length ? (quote.items as QuoteLineItem[]) : [emptyLineItem()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quote');
    } finally {
      setLoading('');
    }
  }

  async function saveQuoteEdit() {
    if (!quoteDetailId) return;
    const items = editItems
      .filter((item) => item.name.trim())
      .map((item) => ({
        ...item,
        quantity: Number(item.quantity) || 1,
        price: Number(item.price) || 0,
        total: (Number(item.quantity) || 1) * (Number(item.price) || 0),
      }));
    const amount = items.length ? sumItems(items) : Number(editAmount);
    setLoading(`save-quote-${quoteDetailId}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/quotes/${quoteDetailId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          amount,
          validUntil: editValidUntil,
          description: editDescription || null,
          terms: editTerms || null,
          notes: editNotes || null,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote updated');
      setQuoteEditing(false);
      await openQuoteDetail(quoteDetailId);
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quote');
    } finally {
      setLoading('');
    }
  }

  async function rejectQuoteAction(id: string) {
    const reason = prompt('Rejection reason (optional):') ?? '';
    setLoading(`reject-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/quotes/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote rejected');
      if (quoteDetailId === id) await openQuoteDetail(id);
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject quote');
    } finally {
      setLoading('');
    }
  }

  async function expireQuoteAction(id: string) {
    if (!confirm('Mark this quote as expired?')) return;
    setLoading(`expire-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/quotes/${id}/expire`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote expired');
      if (quoteDetailId === id) await openQuoteDetail(id);
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to expire quote');
    } finally {
      setLoading('');
    }
  }

  async function loadQuoteSettings() {
    const res = await fetch('/api/msp/quote-settings');
    const data = await res.json();
    if (res.ok) setQuoteSettings(data.settings);
  }

  async function saveQuoteSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!quoteSettings) return;
    setLoading('quote-settings');
    setError('');
    try {
      const res = await fetch('/api/msp/quote-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quoteSettings),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote settings saved');
      setQuoteSettings(data.settings);
      setShowQuoteSettings(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quote settings');
    } finally {
      setLoading('');
    }
  }

  async function acceptQuote(id: string) {
    setLoading(`accept-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/quotes/${id}/accept`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote accepted');
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept quote');
    } finally {
      setLoading('');
    }
  }

  async function sendQuote(id: string) {
    if (!askToEmailClient('Send this quote to the client by email?')) return;
    setLoading(`send-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/quotes/${id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote email sent');
      if (quoteDetailId === id) await openQuoteDetail(id);
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send quote');
    } finally {
      setLoading('');
    }
  }

  async function sendInvoice(id: string) {
    if (!askToEmailClient('Send this invoice to the client by email?')) return;
    setLoading(`send-inv-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/invoices/${id}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Invoice email sent');
      if (invoiceDetailId === id) await openInvoiceDetail(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invoice');
    } finally {
      setLoading('');
    }
  }

  async function deleteQuote(id: string) {
    if (!confirm('Delete this quote?')) return;
    setLoading(`delete-${id}`);
    setError('');
    try {
      const res = await fetch(`/api/msp/quotes/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote deleted');
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete quote');
    } finally {
      setLoading('');
    }
  }

  async function convertQuote() {
    if (!convertQuoteId || !convertDueDate) return;
    setLoading('convert');
    setError('');
    try {
      const res = await fetch(`/api/msp/quotes/${convertQuoteId}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: convertDueDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      setMessage('Quote converted to invoice');
      setConvertQuoteId(null);
      setConvertDueDate('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert quote');
    } finally {
      setLoading('');
    }
  }

  async function createQuote(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!createQuoteClientId) {
      setError('Please select a client.');
      return;
    }
    setLoading('create-quote');
    setError('');
    const form = new FormData(e.currentTarget);
    try {
      const items = createItems
        .filter((item) => item.name.trim())
        .map((item) => ({
          ...item,
          quantity: Number(item.quantity) || 1,
          price: Number(item.price) || 0,
          total: (Number(item.quantity) || 1) * (Number(item.price) || 0),
        }));
      const amount = items.length ? sumItems(items) : Number(form.get('amount'));
      const wantsEmail = form.get('sendNow') === 'on';
      const emailAfterCreate =
        wantsEmail && askToEmailClient('Email this quote to the client after it is created?');
      const res = await fetch('/api/msp/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: createQuoteClientId,
          title: form.get('title'),
          amount,
          validUntil: form.get('validUntil'),
          description: form.get('description') || undefined,
          terms: form.get('terms') || undefined,
          notes: form.get('notes') || undefined,
          items,
          status: wantsEmail ? 'sent' : 'draft',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      if (emailAfterCreate && data.quote?.id) {
        await fetch(`/api/msp/quotes/${data.quote.id}/send-email`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      }
      setMessage('Quote created');
      setShowQuoteForm(false);
      resetCreateForms();
      setTab('quotes');
      await loadQuotes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
    } finally {
      setLoading('');
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof Receipt }[] = [
    { id: 'overview', label: 'Overview', icon: Receipt },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'quotes', label: 'Quotes', icon: Send },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Accounting</h1>
        <p className="mt-1 text-sm text-slate-500">MSP invoices, quotes, and financial overview</p>
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
              tab === id
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'overview' && summary && (
        <div className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total revenue" value={formatCurrency(summary.totalRevenue)} subtext={`${summary.paidInvoices} paid invoices`} icon={Receipt} accent="bg-emerald-50 text-emerald-600" />
            <StatCard label="Pending" value={formatCurrency(summary.pendingAmount)} subtext={`${summary.overdueInvoices} overdue`} icon={FileText} accent="bg-amber-50 text-amber-600" />
            <StatCard label="Invoices" value={summary.totalInvoices} icon={FileText} accent="bg-blue-50 text-blue-600" />
            <StatCard label="Quotes" value={summary.totalQuotes} subtext={`${summary.acceptedQuotes} accepted · ${summary.convertedQuotes} converted`} icon={Send} accent="bg-violet-50 text-violet-600" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <MiniStat label="Draft quotes" value={summary.draftQuotes} />
            <MiniStat label="Sent quotes" value={summary.sentQuotes} />
            <MiniStat label="Accepted quotes" value={summary.acceptedQuotes} />
          </div>
          <RecentTransactionsCard
            transactions={recentTransactions}
            onSelectInvoice={openInvoiceDetail}
            loading={loading.startsWith('inv-')}
          />
        </div>
      )}

      {tab === 'invoices' && (
        <div className="space-y-4">
          <ListFilters
            status={invoiceStatus}
            clientId={invoiceClientId}
            clients={clients}
            total={invoicePagination.total}
            onStatusChange={(value) => {
              setInvoicePage(1);
              setInvoiceStatus(value);
            }}
            onClientChange={(value) => {
              setInvoicePage(1);
              setInvoiceClientId(value);
            }}
            statusOptions={['pending', 'paid', 'overdue', 'partial', 'cancelled']}
          />
          <DataTable
            empty="No invoices found"
            headers={['Invoice', 'Client', 'Amount', 'Due', 'Status', 'Actions']}
            rows={invoices.map((inv) => [
              <InvoiceLink key={`inv-${inv.id}`} id={inv.id} label={inv.invoiceNumber} />,
              <ClientLink
                key={`client-${inv.id}`}
                id={inv.clientId ?? inv.client?.id}
                label={inv.client?.name ?? '—'}
                className="font-medium text-slate-900 hover:text-indigo-700"
              />,
              <InvoiceAmountCell
                key={`amt-${inv.id}`}
                amount={inv.amount}
                paidAmount={inv.paidAmount}
                currency={inv.currency}
              />,
              String(inv.dueDate).slice(0, 10),
              <StatusBadge key={inv.id} status={inv.status} colors={INVOICE_STATUS_COLORS} />,
              <ActionCell key={`a-${inv.id}`}>
                <RowAction label="View details" onClick={() => openInvoiceDetail(inv.id)} disabled={!!loading} loading={loading === `inv-${inv.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </RowAction>
                {inv.status !== 'paid' ? (
                  <RowAction label="Mark paid" variant="primary" onClick={() => markPaid(inv.id)} disabled={!!loading} loading={loading === `paid-${inv.id}`}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </RowAction>
                ) : (
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700" title="Paid">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  </span>
                )}
                {isAdmin && inv.status !== 'cancelled' && (
                  <RowAction label="Email invoice" variant="info" onClick={() => sendInvoice(inv.id)} disabled={!!loading} loading={loading === `send-inv-${inv.id}`}>
                    <Mail className="h-3.5 w-3.5" />
                  </RowAction>
                )}
                {isAdmin && inv.status !== 'cancelled' && (
                  <RowAction label="Cancel invoice" variant="warning" onClick={() => cancelInvoice(inv.id)} disabled={!!loading} loading={loading === `cancel-${inv.id}`}>
                    <Ban className="h-3.5 w-3.5" />
                  </RowAction>
                )}
                {isAdmin && (
                  <RowAction label="Delete invoice" variant="danger" onClick={() => deleteInvoice(inv.id)} disabled={!!loading} loading={loading === `delete-inv-${inv.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </RowAction>
                )}
              </ActionCell>,
            ])}
          />
          <PaginationBar
            page={invoicePagination.page}
            pages={invoicePagination.pages}
            total={invoicePagination.total}
            onPageChange={setInvoicePage}
            disabled={!!loading}
          />
        </div>
      )}

      {tab === 'quotes' && (
        <div className="space-y-4">
          <ListFilters
            status={quoteStatus}
            clientId={quoteClientId}
            clients={clients}
            total={quotePagination.total}
            onStatusChange={(value) => {
              setQuotePage(1);
              setQuoteStatus(value);
            }}
            onClientChange={(value) => {
              setQuotePage(1);
              setQuoteClientId(value);
            }}
            statusOptions={['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted']}
          />
          <DataTable
            empty="No quotes found"
            headers={['Quote', 'Title', 'Client', 'Amount', 'Valid until', 'Status', 'Actions']}
            rows={quotes.map((q) => [
              <QuoteLink key={`quote-${q.id}`} id={q.id} label={q.quoteNumber} />,
              q.title,
              <ClientLink
                key={`client-${q.id}`}
                id={q.clientId ?? q.client?.id}
                label={q.client?.name ?? '—'}
                className="font-medium text-slate-900 hover:text-indigo-700"
              />,
              formatCurrency(q.amount),
              String(q.validUntil).slice(0, 10),
              <StatusBadge key={q.id} status={q.status} colors={QUOTE_STATUS_COLORS} />,
              <ActionCell key={`a-${q.id}`}>
                <RowAction label="View details" onClick={() => openQuoteDetail(q.id)} disabled={!!loading} loading={loading === `quote-${q.id}`}>
                  <Eye className="h-3.5 w-3.5" />
                </RowAction>
                {(q.status === 'draft' || q.status === 'sent') && isAdmin && (
                  <RowAction label="Accept quote" variant="success" onClick={() => acceptQuote(q.id)} disabled={!!loading} loading={loading === `accept-${q.id}`}>
                    <Check className="h-3.5 w-3.5" />
                  </RowAction>
                )}
                {(q.status === 'draft' || q.status === 'sent') && isAdmin && (
                  <RowAction label="Email quote" variant="info" onClick={() => sendQuote(q.id)} disabled={!!loading} loading={loading === `send-${q.id}`}>
                    <Mail className="h-3.5 w-3.5" />
                  </RowAction>
                )}
                {q.status === 'sent' && isAdmin && (
                  <RowAction label="Reject quote" variant="danger" onClick={() => rejectQuoteAction(q.id)} disabled={!!loading} loading={loading === `reject-${q.id}`}>
                    <X className="h-3.5 w-3.5" />
                  </RowAction>
                )}
                {(q.status === 'draft' || q.status === 'sent') && isAdmin && (
                  <RowAction label="Expire quote" variant="warning" onClick={() => expireQuoteAction(q.id)} disabled={!!loading} loading={loading === `expire-${q.id}`}>
                    <Clock className="h-3.5 w-3.5" />
                  </RowAction>
                )}
                {q.status === 'accepted' && isAdmin && (
                  <RowAction
                    label="Convert to invoice"
                    variant="accent"
                    onClick={() => {
                      setConvertQuoteId(q.id);
                      setConvertDueDate(new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10));
                    }}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" />
                  </RowAction>
                )}
                {q.status !== 'converted' && isAdmin && (
                  <RowAction label="Delete quote" variant="danger" onClick={() => deleteQuote(q.id)} disabled={!!loading} loading={loading === `delete-${q.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </RowAction>
                )}
              </ActionCell>,
            ])}
          />
          <PaginationBar
            page={quotePagination.page}
            pages={quotePagination.pages}
            total={quotePagination.total}
            onPageChange={setQuotePage}
            disabled={!!loading}
          />
        </div>
      )}

      {showQuoteForm && (
        <Modal title="Create quote" onClose={() => { setShowQuoteForm(false); resetCreateForms(); }} wide>
          <form key={`create-quote-${formPrefillKey}`} onSubmit={createQuote} className="space-y-4">
            {ticketPrefill?.ticketNumber && (
              <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                {ticketPrefill.hasCostData
                  ? `Prefilled from ticket ${ticketPrefill.ticketNumber} including cost details.`
                  : `Client prefilled from ticket ${ticketPrefill.ticketNumber}.`}
              </p>
            )}
            <Field label="Client">
              <ClientSearchSelect
                clients={clients}
                value={createQuoteClientId}
                onChange={setCreateQuoteClientId}
                required
                placeholder="Type client or company name…"
                inputClassName={inputClass}
              />
              <ClientPrefillHint clients={clients} clientId={createQuoteClientId} />
            </Field>
            <Field label="Title">
              <input name="title" required className={inputClass} defaultValue={ticketPrefill?.title ?? ''} />
            </Field>
            <Field label="Amount (TTD) — auto-calculated if line items added">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                defaultValue={sumItems(createItems) || ticketPrefill?.amount || ''}
              />
            </Field>
            <Field label="Valid until"><input name="validUntil" type="date" required className={inputClass} /></Field>
            <Field label="Description">
              <textarea name="description" rows={2} className={inputClass} defaultValue={ticketPrefill?.description ?? ''} />
            </Field>
            <Field label="Terms"><textarea name="terms" rows={2} className={inputClass} /></Field>
            <Field label="Notes">
              <textarea name="notes" rows={2} className={inputClass} defaultValue={ticketPrefill?.notes ?? ''} />
            </Field>
            <LineItemsEditor items={createItems} onChange={setCreateItems} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="sendNow" className="rounded" />
              Mark as sent{confirmBeforeClientEmail ? ' (you will be asked to confirm email)' : ' and email client immediately'}
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowQuoteForm(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={loading === 'create-quote'} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading === 'create-quote' ? 'Creating…' : 'Create quote'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showInvoiceForm && (
        <Modal title="Create invoice" onClose={() => { setShowInvoiceForm(false); resetCreateForms(); }} wide>
          <form
            key={`create-invoice-${formPrefillKey}`}
            onSubmit={async (e) => {
              e.preventDefault();
              if (!createInvoiceClientId) {
                setError('Please select a client.');
                return;
              }
              setLoading('create-invoice');
              setError('');
              const form = new FormData(e.currentTarget);
              const wantsEmail = form.get('sendNow') === 'on';
              const sendEmail =
                wantsEmail && askToEmailClient('Email this invoice to the client after it is created?');
              try {
                const items = createItems
                  .filter((item) => item.name.trim())
                  .map((item) => ({
                    ...item,
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price) || 0,
                    total: (Number(item.quantity) || 1) * (Number(item.price) || 0),
                  }));
                const amount = items.length ? sumItems(items) : Number(form.get('amount'));
                const res = await fetch('/api/msp/invoices', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    clientId: createInvoiceClientId,
                    amount,
                    dueDate: form.get('dueDate'),
                    billingCycle: form.get('billingCycle'),
                    paymentGateway: form.get('paymentGateway'),
                    description: form.get('description') || null,
                    items,
                    sendEmail,
                  }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.message || 'Failed');
                setMessage('Invoice created');
                setShowInvoiceForm(false);
                resetCreateForms();
                setTab('invoices');
                await refresh();
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to create invoice');
              } finally {
                setLoading('');
              }
            }}
            className="space-y-4"
          >
            {ticketPrefill?.ticketNumber && (
              <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-800">
                {ticketPrefill.hasCostData
                  ? `Prefilled from ticket ${ticketPrefill.ticketNumber} including cost details.`
                  : `Client prefilled from ticket ${ticketPrefill.ticketNumber}.`}
              </p>
            )}
            <Field label="Client">
              <ClientSearchSelect
                clients={clients}
                value={createInvoiceClientId}
                onChange={setCreateInvoiceClientId}
                required
                placeholder="Type client or company name…"
                inputClassName={inputClass}
              />
              <ClientPrefillHint clients={clients} clientId={createInvoiceClientId} />
            </Field>
            <Field label="Amount (TTD) — auto-calculated if line items added">
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
                defaultValue={sumItems(createItems) || ticketPrefill?.amount || ''}
              />
            </Field>
            <Field label="Due date">
              <input name="dueDate" type="date" required className={inputClass} />
            </Field>
            <Field label="Billing cycle">
              <select name="billingCycle" defaultValue="immediately" className={inputClass}>
                {['immediately', 'monthly', 'trimonthly'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Payment gateway">
              <select name="paymentGateway" defaultValue="CASH" className={inputClass}>
                <option value="CASH">CASH</option>
                <option value="PayPal">PayPal</option>
                <option value="bank_transfer">bank_transfer</option>
                <option value="WiPay">WiPay</option>
              </select>
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={3}
                className={inputClass}
                defaultValue={ticketPrefill?.description ?? ''}
              />
            </Field>
            <LineItemsEditor items={createItems} onChange={setCreateItems} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="sendNow" className="rounded" />
              Email client after create{confirmBeforeClientEmail ? ' (confirmation required)' : ''}
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowInvoiceForm(false)} className="rounded-xl border px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading === 'create-invoice'}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {loading === 'create-invoice' ? 'Creating…' : 'Create invoice'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {invoiceDetailId && invoiceDetail && (
        <Modal
          title={`Invoice ${invoiceDetail.invoiceNumber}`}
          wide
          onClose={() => {
            setInvoiceDetailId(null);
            setInvoiceDetail(null);
            setInvoiceEditing(false);
            setInvoicePayments([]);
            setInvoiceEmailHistory([]);
            setInvoiceLinks([]);
          }}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={invoiceDetail.status} colors={INVOICE_STATUS_COLORS} />
              {isAdmin && invoiceDetail.status !== 'cancelled' && invoiceDetail.status !== 'paid' && !invoiceEditing && (
                <button type="button" onClick={() => setInvoiceEditing(true)} className="text-sm font-semibold text-indigo-600 hover:underline">
                  Edit invoice
                </button>
              )}
            </div>

            {!invoiceEditing ? (
              <>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Client</p>
                <p className="mt-1 font-semibold text-slate-900">
                  <ClientLink
                    id={invoiceDetail.clientId ?? invoiceDetail.client?.id}
                    label={invoiceDetail.client?.name ?? '—'}
                    className="font-semibold text-slate-900 hover:text-indigo-700"
                  />
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
                <div className="mt-1">
                  <StatusBadge status={invoiceDetail.status} colors={INVOICE_STATUS_COLORS} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Total</p>
                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(Number(invoiceDetail.amount), invoiceDetail.currency)}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Paid</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {formatCurrency(Number(invoiceDetail.paidAmount ?? 0), invoiceDetail.currency)}
                </p>
              </div>
              {invoiceOutstanding(Number(invoiceDetail.amount), Number(invoiceDetail.paidAmount ?? 0)) > 0.009 && (
                <div className="col-span-2 sm:col-span-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Outstanding</p>
                  <p className="mt-1 font-semibold text-amber-800">
                    {formatCurrency(
                      invoiceOutstanding(Number(invoiceDetail.amount), Number(invoiceDetail.paidAmount ?? 0)),
                      invoiceDetail.currency
                    )}
                  </p>
                </div>
              )}
            </div>
            {invoiceDetail.description && <p className="text-sm text-slate-600">{invoiceDetail.description}</p>}
            {(invoiceDetail.items?.length ?? 0) > 0 && (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                  <tbody>
                    {invoiceDetail.items!.map((item, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2">{item.name}</td>
                        <td className="px-3 py-2">{item.description}</td>
                        <td className="px-3 py-2 text-right">{item.quantity}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.price, invoiceDetail.currency)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(item.total ?? item.quantity * item.price, invoiceDetail.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <InvoiceLinksSection
              invoiceId={invoiceDetail.id}
              clientId={invoiceDetail.clientId ?? invoiceDetail.client?.id}
              links={invoiceLinks}
              onLinksChange={setInvoiceLinks}
              canEdit={isAdmin}
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Add payment</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Amount"
                  type="number"
                  step="0.01"
                  min="0"
                  className={inputClass}
                />
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)} className={inputClass}>
                  <option value="CASH">CASH</option>
                  <option value="paypal">paypal</option>
                  <option value="bank_transfer">bank_transfer</option>
                </select>
                <input value={paymentReference} onChange={(e) => setPaymentReference(e.target.value)} placeholder="Reference (optional)" className={inputClass} />
                <input value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Notes (optional)" className={inputClass} />
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={addPayment}
                  disabled={loading === `addpay-${invoiceDetailId}`}
                  className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {loading === `addpay-${invoiceDetailId}` ? 'Saving…' : 'Add payment'}
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Payment history</p>
              <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                {invoicePayments.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-slate-500">No payments yet</div>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {invoicePayments.map((p) => (
                      <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">{formatCurrency(Number(p.amount))}</p>
                          <p className="text-xs text-slate-500">
                            {String(p.paymentDate).slice(0, 10)} · {p.paymentMethod}
                            {p.reference ? ` · ref: ${p.reference}` : ''}
                          </p>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => removePayment(p.id)}
                            disabled={loading === `delpay-${p.id}`}
                            className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-60"
                          >
                            {loading === `delpay-${p.id}` ? 'Deleting…' : 'Delete'}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <EmailSentHistory logs={invoiceEmailHistory} />

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => printDocument(`/api/msp/invoices/${invoiceDetailId}/print`)}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm"
              >
                <Printer className="h-4 w-4" />
                Print
              </button>
              <button
                type="button"
                onClick={() => copyShareLink('invoice', invoiceDetailId)}
                disabled={loading === `share-invoice-${invoiceDetailId}`}
                className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm disabled:opacity-60"
              >
                <Link2 className="h-4 w-4" />
                {loading === `share-invoice-${invoiceDetailId}` ? 'Copying…' : 'Copy public link'}
              </button>
              {isAdmin && invoiceDetail.status !== 'cancelled' && (
                <button
                  type="button"
                  onClick={() => sendInvoice(invoiceDetailId)}
                  disabled={loading === `send-inv-${invoiceDetailId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {loading === `send-inv-${invoiceDetailId}` ? 'Sending…' : 'Send email'}
                </button>
              )}
              {isAdmin && invoiceDetail.status !== 'cancelled' && (
                <button type="button" onClick={() => cancelInvoice(invoiceDetailId)} className="rounded-xl border px-4 py-2 text-sm">
                  Cancel invoice
                </button>
              )}
              {isAdmin && (
                <button type="button" onClick={() => deleteInvoice(invoiceDetailId)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
                  Delete invoice
                </button>
              )}
            </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Amount">
                    <input value={editInvoiceAmount} onChange={(e) => setEditInvoiceAmount(e.target.value)} type="number" step="0.01" className={inputClass} />
                  </Field>
                  <Field label="Due date">
                    <input value={editInvoiceDueDate} onChange={(e) => setEditInvoiceDueDate(e.target.value)} type="date" className={inputClass} />
                  </Field>
                </div>
                <Field label="Description">
                  <textarea value={editInvoiceDescription} onChange={(e) => setEditInvoiceDescription(e.target.value)} rows={3} className={inputClass} />
                </Field>
                <LineItemsEditor items={editInvoiceItems} onChange={setEditInvoiceItems} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setInvoiceEditing(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
                  <button type="button" onClick={saveInvoiceEdit} disabled={loading === `save-inv-${invoiceDetailId}`} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {loading === `save-inv-${invoiceDetailId}` ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {quoteDetailId && quoteDetail && (
        <Modal
          title={`Quote ${quoteDetail.quoteNumber}`}
          wide
          onClose={() => {
            setQuoteDetailId(null);
            setQuoteDetail(null);
            setQuoteEditing(false);
            setQuoteEmailHistory([]);
          }}
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge status={quoteDetail.status} colors={QUOTE_STATUS_COLORS} />
              {isAdmin && quoteDetail.status !== 'converted' && !quoteEditing && (
                <button type="button" onClick={() => setQuoteEditing(true)} className="text-sm font-semibold text-indigo-600 hover:underline">
                  Edit quote
                </button>
              )}
            </div>

            {!quoteEditing ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs uppercase text-slate-400">Client</p><p className="font-semibold"><ClientLink id={quoteDetail.clientId ?? quoteDetail.client?.id} label={quoteDetail.client?.name ?? '—'} className="font-semibold text-slate-900 hover:text-indigo-700" /></p></div>
                  <div><p className="text-xs uppercase text-slate-400">Valid until</p><p className="font-semibold">{String(quoteDetail.validUntil).slice(0, 10)}</p></div>
                  <div><p className="text-xs uppercase text-slate-400">Title</p><p className="font-semibold">{quoteDetail.title}</p></div>
                  <div><p className="text-xs uppercase text-slate-400">Amount</p><p className="font-semibold">{formatCurrency(quoteDetail.amount, quoteDetail.currency)}</p></div>
                </div>
                {quoteDetail.description && <p className="text-sm text-slate-600">{quoteDetail.description}</p>}
                {(quoteDetail.items?.length ?? 0) > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead><tr className="bg-slate-50"><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Description</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Price</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
                      <tbody>
                        {quoteDetail.items!.map((item, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-3 py-2">{item.name}</td>
                            <td className="px-3 py-2">{item.description}</td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.price, quoteDetail.currency)}</td>
                            <td className="px-3 py-2 text-right">{formatCurrency(item.total ?? item.quantity * item.price, quoteDetail.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {quoteDetail.terms && <div><p className="text-xs uppercase text-slate-400">Terms</p><p className="text-sm">{quoteDetail.terms}</p></div>}
                {quoteDetail.notes && <div><p className="text-xs uppercase text-slate-400">Notes</p><p className="text-sm whitespace-pre-wrap">{quoteDetail.notes}</p></div>}
              </>
            ) : (
              <div className="space-y-4">
                <Field label="Title"><input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className={inputClass} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Amount"><input value={editAmount} onChange={(e) => setEditAmount(e.target.value)} type="number" step="0.01" className={inputClass} /></Field>
                  <Field label="Valid until"><input value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} type="date" className={inputClass} /></Field>
                </div>
                <Field label="Description"><textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} className={inputClass} /></Field>
                <Field label="Terms"><textarea value={editTerms} onChange={(e) => setEditTerms(e.target.value)} rows={2} className={inputClass} /></Field>
                <Field label="Notes"><textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className={inputClass} /></Field>
                <LineItemsEditor items={editItems} onChange={setEditItems} />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setQuoteEditing(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
                  <button type="button" onClick={saveQuoteEdit} disabled={loading === `save-quote-${quoteDetailId}`} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                    {loading === `save-quote-${quoteDetailId}` ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            )}

            {!quoteEditing && <EmailSentHistory logs={quoteEmailHistory} />}

            {!quoteEditing && (
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => printDocument(`/api/msp/quotes/${quoteDetailId}/print`)}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm"
                >
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => copyShareLink('quote', quoteDetailId)}
                  disabled={loading === `share-quote-${quoteDetailId}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm disabled:opacity-60"
                >
                  <Link2 className="h-4 w-4" />
                  {loading === `share-quote-${quoteDetailId}` ? 'Copying…' : 'Copy public link'}
                </button>
                {isAdmin && (quoteDetail.status === 'draft' || quoteDetail.status === 'sent') && (
                  <button type="button" onClick={() => sendQuote(quoteDetailId)} className="rounded-xl bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white">Send email</button>
                )}
                {isAdmin && quoteDetail.status === 'sent' && (
                  <button type="button" onClick={() => rejectQuoteAction(quoteDetailId)} className="rounded-xl border px-3 py-1.5 text-sm">Reject</button>
                )}
                {isAdmin && (quoteDetail.status === 'draft' || quoteDetail.status === 'sent') && (
                  <button type="button" onClick={() => expireQuoteAction(quoteDetailId)} className="rounded-xl border px-3 py-1.5 text-sm">Expire</button>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {showQuoteSettings && (
        <Modal title="Quote settings" wide onClose={() => setShowQuoteSettings(false)}>
          {!quoteSettings ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
          ) : (
          <form onSubmit={saveQuoteSettings} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><input value={quoteSettings.companyName} onChange={(e) => setQuoteSettings({ ...quoteSettings, companyName: e.target.value })} className={inputClass} /></Field>
            <Field label="Currency"><input value={quoteSettings.currency} onChange={(e) => setQuoteSettings({ ...quoteSettings, currency: e.target.value })} className={inputClass} /></Field>
            <Field label="Tax rate (%)"><input value={quoteSettings.taxRate} onChange={(e) => setQuoteSettings({ ...quoteSettings, taxRate: Number(e.target.value) })} type="number" step="0.1" className={inputClass} /></Field>
            <Field label="Phone"><input value={quoteSettings.companyPhone} onChange={(e) => setQuoteSettings({ ...quoteSettings, companyPhone: e.target.value })} className={inputClass} /></Field>
            <div className="sm:col-span-2"><Field label="Address"><input value={quoteSettings.companyAddress} onChange={(e) => setQuoteSettings({ ...quoteSettings, companyAddress: e.target.value })} className={inputClass} /></Field></div>
            <div className="sm:col-span-2"><Field label="Website"><input value={quoteSettings.companyWebsite} onChange={(e) => setQuoteSettings({ ...quoteSettings, companyWebsite: e.target.value })} className={inputClass} /></Field></div>
            <div className="sm:col-span-2"><Field label="Payment terms"><textarea value={quoteSettings.paymentTerms} onChange={(e) => setQuoteSettings({ ...quoteSettings, paymentTerms: e.target.value })} rows={2} className={inputClass} /></Field></div>
            <div className="sm:col-span-2"><Field label="Warranty terms"><textarea value={quoteSettings.warrantyTerms} onChange={(e) => setQuoteSettings({ ...quoteSettings, warrantyTerms: e.target.value })} rows={2} className={inputClass} /></Field></div>
            <div className="sm:col-span-2"><Field label="Closing message"><textarea value={quoteSettings.closingMessage} onChange={(e) => setQuoteSettings({ ...quoteSettings, closingMessage: e.target.value })} rows={2} className={inputClass} /></Field></div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <button type="button" onClick={() => setShowQuoteSettings(false)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
              <button type="submit" disabled={loading === 'quote-settings'} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading === 'quote-settings' ? 'Saving…' : 'Save settings'}
              </button>
            </div>
          </form>
          )}
        </Modal>
      )}

      {convertQuoteId && (
        <Modal title="Convert quote to invoice" onClose={() => setConvertQuoteId(null)}>
          <div className="space-y-4">
            <Field label="Invoice due date">
              <input type="date" value={convertDueDate} onChange={(e) => setConvertDueDate(e.target.value)} className={inputClass} />
            </Field>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConvertQuoteId(null)} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={convertQuote} disabled={!convertDueDate || loading === 'convert'} className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {loading === 'convert' ? 'Converting…' : 'Convert to invoice'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500';

function ClientPrefillHint({ clients, clientId }: { clients: ClientOption[]; clientId: string }) {
  const client = clients.find((c) => c.id === clientId);
  if (!client) return null;
  const parts = [
    client.phone ? `Contact: ${client.phone}` : null,
    client.email ? `Email: ${client.email}` : null,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return <p className="mt-1 text-xs text-slate-500">{parts.join(' · ')}</p>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function RecentTransactionsCard({
  transactions,
  onSelectInvoice,
  loading = false,
}: {
  transactions: RecentFinancialTransaction[];
  onSelectInvoice: (invoiceId: string) => void;
  loading?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Recent transactions</p>
        <ArrowRightLeft className="h-4 w-4 text-slate-300" aria-hidden="true" />
      </div>
      {transactions.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-slate-400">No payments recorded yet</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Client</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Invoice</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Method</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Reference</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Amount</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-600">{String(tx.paymentDate).slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    <ClientLink
                      id={tx.clientId}
                      label={tx.clientName ?? '—'}
                      className="font-medium text-slate-900 hover:text-indigo-700"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <InvoiceLink id={tx.invoiceId} label={tx.invoiceNumber} />
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600">{tx.paymentMethod}</td>
                  <td className="px-4 py-3 text-slate-500">{tx.reference ?? '—'}</td>
                  <td className="px-4 py-3 font-semibold text-slate-900">
                    {formatCurrency(tx.amount, tx.currency)}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => onSelectInvoice(tx.invoiceId)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 disabled:opacity-60"
                      title="View invoice"
                      aria-label="View invoice"
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, colors }: { status: string; colors: Record<string, string> }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${colors[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function ListFilters({
  status,
  clientId,
  clients,
  total,
  statusOptions,
  onStatusChange,
  onClientChange,
}: {
  status: string;
  clientId: string;
  clients: ClientOption[];
  total: number;
  statusOptions: string[];
  onStatusChange: (value: string) => void;
  onClientChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select value={status} onChange={(e) => onStatusChange(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
        <option value="all">All statuses</option>
        {statusOptions.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <div className="min-w-[14rem] flex-1 sm:flex-none sm:min-w-[16rem]">
        <ClientSearchSelect
          clients={clients}
          value={clientId}
          onChange={(id) => onClientChange(id || 'all')}
          allowAll
          placeholder="Filter by client…"
          inputClassName="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </div>
      <span className="text-sm text-slate-500">{total} result{total === 1 ? '' : 's'}</span>
    </div>
  );
}

function PaginationBar({
  page,
  pages,
  total,
  onPageChange,
  disabled,
}: {
  page: number;
  pages: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  if (total === 0) return null;

  const safePages = Math.max(pages, 1);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <span className="text-slate-500">
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Previous
        </button>
        <span className="px-2 text-slate-600">
          Page {page} of {safePages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= safePages}
          className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function RowAction({
  label,
  children,
  onClick,
  disabled,
  loading,
  variant = 'default',
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  const styles: Record<NonNullable<typeof variant>, string> = {
    default: 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
    primary: 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100',
    info: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    warning: 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100',
    danger: 'border-red-200 bg-red-50 text-red-700 hover:bg-red-100',
    accent: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      title={label}
      aria-label={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]}`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}

function ActionCell({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1.5">{children}</div>;
}

function DataTable({ headers, rows, empty }: { headers: string[]; rows: React.ReactNode[][]; empty: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold text-slate-600">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="px-5 py-12 text-center text-slate-400">{empty}</td></tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-4 py-3 text-slate-700 ${j === row.length - 1 ? 'align-top' : ''}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ${wide ? 'max-w-3xl' : 'max-w-lg'}`}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LineItemsEditor({ items, onChange }: { items: QuoteLineItem[]; onChange: (items: QuoteLineItem[]) => void }) {
  function updateItem(index: number, patch: Partial<QuoteLineItem>) {
    const next = items.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, ...patch };
      updated.total = (Number(updated.quantity) || 0) * (Number(updated.price) || 0);
      return updated;
    });
    onChange(next);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Line items</p>
        <button type="button" onClick={() => onChange([...items, emptyLineItem()])} className="text-xs font-semibold text-indigo-600 hover:underline">
          Add row
        </button>
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-5">
            <input value={item.name} onChange={(e) => updateItem(index, { name: e.target.value })} placeholder="Item" className={inputClass} />
            <input value={item.description ?? ''} onChange={(e) => updateItem(index, { description: e.target.value })} placeholder="Description" className={`${inputClass} sm:col-span-2`} />
            <input value={item.quantity} onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })} type="number" min="1" step="1" placeholder="Qty" className={inputClass} />
            <div className="flex gap-2">
              <input value={item.price} onChange={(e) => updateItem(index, { price: Number(e.target.value) })} type="number" min="0" step="0.01" placeholder="Price" className={inputClass} />
              {items.length > 1 && (
                <button type="button" onClick={() => onChange(items.filter((_, i) => i !== index))} className="text-red-500">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="text-right text-sm font-semibold text-slate-700">Subtotal: {formatCurrency(sumItems(items))}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
