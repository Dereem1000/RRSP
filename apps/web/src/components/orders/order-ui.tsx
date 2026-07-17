'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { LocationHistoryEntry } from '@/lib/orders';
import {
  ORDER_STATUS_COLORS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  SHIPPING_STAGE_COLORS,
  SHIPPING_STAGE_LABELS,
  SHIPPING_STAGES,
  getTrackingUrl,
} from '@/lib/order-constants';
import { ClientSearchSelect, formatClientLabel } from '@/components/clients/ClientSearchSelect';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import type { ClientPickerOption } from '@/lib/client-picker';
import { ClientLink, InvoiceLink, LinkedDocumentLink, OrderLink, TicketLink } from '@/components/links/DocumentLinks';
import { ShipmentJourney } from '@/components/orders/ShipmentJourney';
import {
  AlertTriangle,
  Calculator,
  ExternalLink,
  Eye,
  Link2,
  Loader2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Truck,
  Unlink,
  X,
} from 'lucide-react';
import { InvoiceOrderItemPicker } from '@/components/orders/InvoiceOrderItemPicker';
import type { SelectedInvoiceOrderSource, TicketInvoiceLineItem } from '@/lib/ticket-invoice-order';
import { useRegisterOrderPriceForm } from '@/contexts/PriceCalculatorContext';
import { useOrderPriceAutofill } from '@/hooks/use-order-price-autofill';
import { openPriceCalculator } from '@/lib/price-calculator-storage';

export type OrderView = {
  id: string;
  orderNumber: string;
  clientId: string;
  title: string;
  description?: string | null;
  itemName: string;
  itemUrl?: string | null;
  vendor?: string | null;
  vendorOrderNumber?: string | null;
  trackingNumber?: string | null;
  serialNumber?: string | null;
  orderDate: string;
  estimatedArrival?: string | null;
  actualArrival?: string | null;
  clientPrice: number;
  costPrice?: number;
  quantity: number;
  status: string;
  currentLocation?: string | null;
  shippingStage: string;
  locationHistory?: LocationHistoryEntry[];
  isLoggedInPreAlerts?: boolean;
  preAlertNotes?: string | null;
  notes?: string | null;
  client?: { id: string; name?: string; email?: string };
};

export type OrderLinkView = {
  id: string;
  linkedType: string;
  linkedId: string;
  linkedNumber: string;
  notes?: string | null;
  linkDate?: string;
};

export type LinkableEntity = {
  id: string;
  type: string;
  number: string;
  title: string;
  status?: string;
  clientName?: string;
};

export type OrderFormValues = {
  clientId: string;
  title: string;
  itemName: string;
  costPrice: string;
  clientPrice: string;
  quantity: string;
  description: string;
  itemUrl: string;
  vendor: string;
  vendorOrderNumber: string;
  trackingNumber: string;
  serialNumber: string;
  orderDate: string;
  estimatedArrival: string;
  status: string;
  shippingStage: string;
  currentLocation: string;
  isLoggedInPreAlerts: boolean;
  preAlertNotes: string;
  notes: string;
};

export function emptyOrderForm(clientId = ''): OrderFormValues {
  return {
    clientId,
    title: '',
    itemName: '',
    costPrice: '',
    clientPrice: '',
    quantity: '1',
    description: '',
    itemUrl: '',
    vendor: '',
    vendorOrderNumber: '',
    trackingNumber: '',
    serialNumber: '',
    orderDate: new Date().toISOString().slice(0, 10),
    estimatedArrival: '',
    status: 'ordered',
    shippingStage: 'ordered',
    currentLocation: '',
    isLoggedInPreAlerts: false,
    preAlertNotes: '',
    notes: '',
  };
}

export function orderToForm(order: OrderView): OrderFormValues {
  return {
    clientId: order.clientId,
    title: order.title,
    itemName: order.itemName,
    costPrice: order.costPrice != null ? String(order.costPrice) : '',
    clientPrice: String(order.clientPrice),
    quantity: String(order.quantity),
    description: order.description ?? '',
    itemUrl: order.itemUrl ?? '',
    vendor: order.vendor ?? '',
    vendorOrderNumber: order.vendorOrderNumber ?? '',
    trackingNumber: order.trackingNumber ?? '',
    serialNumber: order.serialNumber ?? '',
    orderDate: order.orderDate?.slice(0, 10) ?? '',
    estimatedArrival: order.estimatedArrival?.slice(0, 10) ?? '',
    status: order.status,
    shippingStage: order.shippingStage,
    currentLocation: order.currentLocation ?? '',
    isLoggedInPreAlerts: Boolean(order.isLoggedInPreAlerts),
    preAlertNotes: order.preAlertNotes ?? '',
    notes: order.notes ?? '',
  };
}

export function canSubmitNewOrder(
  form: OrderFormValues,
  showCost?: boolean,
  options?: { allowSkipUsCost?: boolean }
) {
  if (!form.clientId.trim() || !form.title.trim() || !form.itemName.trim()) return false;
  if (form.clientPrice === '' || Number.isNaN(Number(form.clientPrice))) return false;
  if (options?.allowSkipUsCost) return true;
  if (showCost && (form.costPrice === '' || Number.isNaN(Number(form.costPrice)))) return false;
  return true;
}

export function OrderFormModal({
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
  linkToTicket,
  submitLabel,
  invoiceOrderItems,
  selectedInvoiceSource,
  onInvoiceSourceChange,
  allowSkipUsCost,
}: {
  title: string;
  form: OrderFormValues;
  onChange: (patch: Partial<OrderFormValues>) => void;
  clients: ClientPickerOption[];
  showCost?: boolean;
  loading?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: () => void;
  isNewOrder?: boolean;
  linkToTicket?: { ticketNumber: string };
  submitLabel?: string;
  invoiceOrderItems?: TicketInvoiceLineItem[];
  selectedInvoiceSource?: SelectedInvoiceOrderSource | null;
  onInvoiceSourceChange?: (source: SelectedInvoiceOrderSource | null) => void;
  allowSkipUsCost?: boolean;
}) {
  const canSubmit = !isNewOrder || canSubmitNewOrder(form, showCost, { allowSkipUsCost });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            {isNewOrder && !linkToTicket && (
              <p className="mt-0.5 text-sm text-slate-500">Client required · ticket created automatically</p>
            )}
            {linkToTicket && (
              <p className="mt-0.5 text-sm text-slate-500">
                Linked to ticket <span className="font-mono font-medium text-indigo-700">{linkToTicket.ticketNumber}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {invoiceOrderItems && invoiceOrderItems.length > 0 && onInvoiceSourceChange ? (
          <InvoiceOrderItemPicker
            items={invoiceOrderItems}
            form={form}
            onApply={onChange}
            onSelectSource={onInvoiceSourceChange}
            selectedSource={selectedInvoiceSource ?? null}
          />
        ) : null}
        <OrderFormFields
          form={form}
          onChange={onChange}
          clients={clients}
          showCost={showCost}
          isNewOrder={isNewOrder}
          linkToTicket={linkToTicket}
          allowSkipUsCost={allowSkipUsCost}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Cancel</button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || !canSubmit}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? 'Saving…' : submitLabel ?? (isNewOrder ? (linkToTicket ? 'Create order & link ticket' : 'Create order & ticket') : 'Create order')}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputClass = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm';

export function OrderFormFields({
  form,
  onChange,
  clients,
  showCost,
  isNewOrder,
  linkToTicket,
  allowSkipUsCost,
}: {
  form: OrderFormValues;
  onChange: (patch: Partial<OrderFormValues>) => void;
  clients: ClientPickerOption[];
  showCost?: boolean;
  isNewOrder?: boolean;
  linkToTicket?: { ticketNumber: string };
  allowSkipUsCost?: boolean;
}) {
  const selectedClient = clients.find((c) => c.id === form.clientId);

  useRegisterOrderPriceForm(Boolean(showCost));

  const { markClientPriceManual } = useOrderPriceAutofill({
    costPrice: form.costPrice,
    itemName: form.itemName,
    enabled: Boolean(showCost),
    onApply: (patch) => onChange(patch),
  });

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {isNewOrder && linkToTicket && (
        <p className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm text-indigo-900">
          This order will be linked to ticket <strong>{linkToTicket.ticketNumber}</strong>. Fill in the part details below.
        </p>
      )}
      {isNewOrder && !linkToTicket && (
        <p className="sm:col-span-2 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 py-2 text-sm text-indigo-900">
          Select the client first. A support ticket (<strong>Awaiting Part</strong>) will be created automatically and linked to this order.
        </p>
      )}
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Client name {isNewOrder && <span className="text-red-600">*</span>}
        </span>
        <ClientSearchSelect
          clients={clients}
          value={form.clientId}
          onChange={(clientId) => onChange({ clientId })}
          placeholder="Type client or company name…"
          required={isNewOrder}
          disabled={Boolean(linkToTicket && form.clientId)}
          inputClassName={`${inputClass}${isNewOrder && !form.clientId ? ' border-amber-300 ring-1 ring-amber-200' : ''}`}
        />
        {isNewOrder && !form.clientId && (
          <p className="mt-1 text-xs text-amber-700">Required — choose who this order is for.</p>
        )}
        {selectedClient && (
          <p className="mt-1 text-xs text-slate-500">
            {linkToTicket ? (
              <>
                Order for{' '}
                <span className="font-medium text-slate-700">{formatClientLabel(selectedClient)}</span>
              </>
            ) : (
              <>
                Ticket will be opened for{' '}
                <span className="font-medium text-slate-700">{formatClientLabel(selectedClient)}</span>
              </>
            )}
            {selectedClient.phone ? (
              <>
                {' '}
                · contact <span className="font-medium text-slate-700">{selectedClient.phone}</span>
              </>
            ) : null}
            .
          </p>
        )}
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Title</span>
        <input value={form.title} onChange={(e) => onChange({ title: e.target.value })} className={inputClass} required />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Item name</span>
        <input value={form.itemName} onChange={(e) => onChange({ itemName: e.target.value })} className={inputClass} required />
      </label>
      {showCost && (
        <label>
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
            US cost
            {allowSkipUsCost ? (
              <span className="ml-1 font-normal normal-case text-slate-500">(optional when using invoice price)</span>
            ) : null}
          </span>
          <div className="flex gap-2">
            <input
              value={form.costPrice}
              onChange={(e) => onChange({ costPrice: e.target.value })}
              type="number"
              min="0"
              step="0.01"
              className={inputClass}
              required={!allowSkipUsCost}
              placeholder="0.00"
            />
            <button
              type="button"
              title="Open price calculator"
              onClick={() =>
                openPriceCalculator({
                  itemName: form.itemName,
                  usCost: parseFloat(form.costPrice) || undefined,
                })
              }
              className="shrink-0 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-indigo-700 hover:bg-indigo-100"
            >
              <Calculator className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-500">Client price auto-fills from sidebar calculator settings.</p>
        </label>
      )}
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Client price</span>
        <input
          value={form.clientPrice}
          onChange={(e) => {
            markClientPriceManual();
            onChange({ clientPrice: e.target.value });
          }}
          type="number"
          min="0"
          step="0.01"
          className={inputClass}
          required
        />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Quantity</span>
        <input value={form.quantity} onChange={(e) => onChange({ quantity: e.target.value })} type="number" min="1" step="1" className={inputClass} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Status</span>
        <select value={form.status} onChange={(e) => onChange({ status: e.target.value })} className={inputClass}>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABELS[s] ?? s}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Shipping stage</span>
        <select value={form.shippingStage} onChange={(e) => onChange({ shippingStage: e.target.value })} className={inputClass}>
          {SHIPPING_STAGES.map((s) => (
            <option key={s} value={s}>{SHIPPING_STAGE_LABELS[s] ?? s}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Order date</span>
        <input value={form.orderDate} onChange={(e) => onChange({ orderDate: e.target.value })} type="date" className={inputClass} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Estimated arrival</span>
        <input value={form.estimatedArrival} onChange={(e) => onChange({ estimatedArrival: e.target.value })} type="date" className={inputClass} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Vendor</span>
        <input value={form.vendor} onChange={(e) => onChange({ vendor: e.target.value })} className={inputClass} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Vendor order #</span>
        <input value={form.vendorOrderNumber} onChange={(e) => onChange({ vendorOrderNumber: e.target.value })} className={inputClass} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Tracking number</span>
        <input value={form.trackingNumber} onChange={(e) => onChange({ trackingNumber: e.target.value })} className={inputClass} />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Serial number</span>
        <input value={form.serialNumber} onChange={(e) => onChange({ serialNumber: e.target.value })} className={inputClass} placeholder="Device serial (optional)" />
      </label>
      <label>
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Current location</span>
        <input value={form.currentLocation} onChange={(e) => onChange({ currentLocation: e.target.value })} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Item URL</span>
        <input value={form.itemUrl} onChange={(e) => onChange({ itemUrl: e.target.value })} type="url" className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Description</span>
        <textarea value={form.description} onChange={(e) => onChange({ description: e.target.value })} rows={2} className={inputClass} />
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Notes</span>
        <textarea value={form.notes} onChange={(e) => onChange({ notes: e.target.value })} rows={2} className={inputClass} />
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" checked={form.isLoggedInPreAlerts} onChange={(e) => onChange({ isLoggedInPreAlerts: e.target.checked })} className="rounded border-slate-300" />
        <span className="text-sm text-slate-700">Logged in pre-alerts</span>
      </label>
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Pre-alert notes</span>
        <textarea value={form.preAlertNotes} onChange={(e) => onChange({ preAlertNotes: e.target.value })} rows={2} className={inputClass} />
      </label>
    </div>
  );
}

export function OrderLinksSection({
  orderId,
  clientId,
  links,
  onLinksChange,
}: {
  orderId: string;
  clientId: string;
  links: OrderLinkView[];
  onLinksChange: (links: OrderLinkView[]) => void;
}) {
  const [linkType, setLinkType] = useState<'ticket' | 'invoice'>('ticket');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkableEntity[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState('');

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const params = new URLSearchParams({ query: q, type: linkType, clientId });
      const res = await fetch(`/api/msp/orders/search-linked-entities?${params}`);
      const data = await res.json();
      if (res.ok) setResults(data.results ?? []);
    } finally {
      setSearching(false);
    }
  }, [linkType, clientId]);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  async function addLink(entity: LinkableEntity) {
    setLoading(`add-${entity.id}`);
    try {
      const res = await fetch(`/api/msp/orders/${orderId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedType: entity.type,
          linkedId: entity.id,
          linkedNumber: entity.number,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to add link');
      onLinksChange([data.link, ...links]);
      setQuery('');
      setResults([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add link');
    } finally {
      setLoading('');
    }
  }

  async function removeLink(linkId: string) {
    if (!confirm('Remove this link?')) return;
    setLoading(`remove-${linkId}`);
    try {
      const res = await fetch(`/api/msp/orders/${orderId}/links/${linkId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to remove link');
      onLinksChange(links.filter((l) => l.id !== linkId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove link');
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Link2 className="h-3.5 w-3.5" />
        Linked tickets & invoices
      </p>

      {links.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              <span>
                <span className="font-medium capitalize text-slate-900">{link.linkedType}</span>
                <span className="text-slate-500"> · </span>
                <LinkedDocumentLink
                  type={link.linkedType === 'invoice' ? 'invoice' : 'ticket'}
                  id={link.linkedId}
                  label={link.linkedNumber}
                  className="text-slate-700 hover:text-indigo-700"
                />
              </span>
              <button
                type="button"
                title="Remove link"
                aria-label="Remove link"
                onClick={() => removeLink(link.id)}
                disabled={!!loading}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
              >
                {loading === `remove-${link.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" /> }
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-slate-500">No links yet.</p>
      )}

      <div className="space-y-2">
        <div className="flex gap-2">
          <select value={linkType} onChange={(e) => setLinkType(e.target.value as 'ticket' | 'invoice')} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <option value="ticket">Ticket</option>
            <option value="invoice">Invoice</option>
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search to link…"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        {searching && <p className="text-xs text-slate-400">Searching…</p>}
        {results.length > 0 && (
          <ul className="max-h-40 overflow-y-auto rounded-xl border border-slate-200">
            {results.map((entity) => (
              <li key={`${entity.type}-${entity.id}`}>
                <button
                  type="button"
                  onClick={() => addLink(entity)}
                  disabled={!!loading}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
                >
                  <span>
                    <span className="font-medium text-slate-900">{entity.number}</span>
                    <span className="block text-xs text-slate-500">{entity.title}</span>
                  </span>
                  {loading === `add-${entity.id}` ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : <Plus className="h-4 w-4 text-indigo-600" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export type EmailMonitoringStatus = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  folder: string;
  checkInterval: number;
  lastCheck?: string | null;
};

export function EmailMonitoringPanel() {
  const [config, setConfig] = useState<EmailMonitoringStatus | null>(null);
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading('load');
    try {
      const res = await fetch('/api/msp/orders/email-monitoring/config');
      const data = await res.json();
      if (res.ok) setConfig(data.config);
    } finally {
      setLoading('');
    }
  }, []);

  useEffect(() => {
    if (open && !config) load();
  }, [open, config, load]);

  async function save() {
    if (!config) return;
    setLoading('save');
    setMessage('');
    try {
      const res = await fetch('/api/msp/orders/email-monitoring/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save');
      setConfig(data.config);
      setMessage('Settings saved.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setLoading('');
    }
  }

  async function checkNow() {
    setLoading('check');
    setMessage('');
    try {
      const res = await fetch('/api/msp/orders/email-monitoring/check', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Check failed');
      setMessage(data.message);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Check failed');
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Mail className="h-4 w-4 text-slate-500" />
          Email monitoring
        </span>
        <span className="text-xs text-slate-500">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4">
          {!config ? (
            <LoadingState />
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={config.enabled} onChange={(e) => setConfig({ ...config, enabled: e.target.checked })} />
                Enable automatic email checks
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">IMAP host</span>
                  <input value={config.host} onChange={(e) => setConfig({ ...config, host: e.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Port</span>
                  <input value={config.port} onChange={(e) => setConfig({ ...config, port: Number(e.target.value) })} type="number" className={inputClass} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Username</span>
                  <input value={config.user} onChange={(e) => setConfig({ ...config, user: e.target.value })} className={inputClass} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Password</span>
                  <input value={config.password} onChange={(e) => setConfig({ ...config, password: e.target.value })} type="password" className={inputClass} />
                </label>
                <label>
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">Folder</span>
                  <input value={config.folder} onChange={(e) => setConfig({ ...config, folder: e.target.value })} className={inputClass} />
                </label>
                <label className="flex items-end gap-2 pb-2 text-sm">
                  <input type="checkbox" checked={config.tls} onChange={(e) => setConfig({ ...config, tls: e.target.checked })} />
                  Use TLS
                </label>
              </div>
              {config.lastCheck && <p className="text-xs text-slate-500">Last check: {formatDate(config.lastCheck)}</p>}
              {message && <p className="text-sm text-slate-600">{message}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={save} disabled={!!loading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                  {loading === 'save' ? 'Saving…' : 'Save settings'}
                </button>
                <button type="button" onClick={checkNow} disabled={!!loading} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                  {loading === 'check' ? 'Checking…' : 'Check emails now'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function StaffOrderDetailModal({
  order,
  showCost,
  isAdmin,
  clients,
  onClose,
  onUpdated,
  onDeleted,
}: {
  order: OrderView;
  showCost?: boolean;
  isAdmin?: boolean;
  clients: Array<{ id: string; name: string; companyName?: string | null }>;
  onClose: () => void;
  onUpdated?: (order: OrderView) => void;
  onDeleted?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<OrderFormValues>(() => orderToForm(order));
  const [links, setLinks] = useState<OrderLinkView[]>([]);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const { askToEmailClient } = useClientEmailPolicy();

  useEffect(() => {
    if (!isAdmin) return;
    fetch(`/api/msp/orders/${order.id}/links`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) setLinks(data.links ?? []);
      })
      .catch(() => {});
  }, [order.id, isAdmin]);

  async function saveEdit() {
    setLoading('save');
    setError('');
    try {
      const body: Record<string, unknown> = {
        clientId: form.clientId,
        title: form.title,
        itemName: form.itemName,
        clientPrice: Number(form.clientPrice),
        quantity: Number(form.quantity) || 1,
        description: form.description || null,
        itemUrl: form.itemUrl || null,
        vendor: form.vendor || null,
        vendorOrderNumber: form.vendorOrderNumber || null,
        trackingNumber: form.trackingNumber || null,
        orderDate: form.orderDate,
        estimatedArrival: form.estimatedArrival || null,
        status: form.status,
        shippingStage: form.shippingStage,
        currentLocation: form.currentLocation || null,
        isLoggedInPreAlerts: form.isLoggedInPreAlerts,
        preAlertNotes: form.preAlertNotes || null,
        notes: form.notes || null,
      };
      if (showCost) body.costPrice = Number(form.costPrice);

      const statusChanged = form.status !== order.status;
      const locationChanged =
        form.shippingStage !== order.shippingStage ||
        (form.currentLocation || '') !== (order.currentLocation || '');
      if (statusChanged || locationChanged) {
        body.sendEmail = askToEmailClient(
          statusChanged
            ? 'Email the client about this order status update?'
            : 'Email the client about this shipment location update?'
        );
      }

      if (form.serialNumber.trim()) {
        body.serialNumber = form.serialNumber.trim();
      }

      const res = await fetch(`/api/msp/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to update order');
      onUpdated?.(data.order);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update order');
    } finally {
      setLoading('');
    }
  }

  async function deleteOrder() {
    if (!confirm(`Delete order ${order.orderNumber}?`)) return;
    setLoading('delete');
    setError('');
    try {
      const res = await fetch(`/api/msp/orders/${order.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete order');
      onDeleted?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete order');
    } finally {
      setLoading('');
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Order</p>
            <h2 className="text-lg font-semibold text-slate-900">{order.title}</h2>
            <p className="text-sm text-slate-500">
              #<OrderLink id={order.id} label={order.orderNumber} />
            </p>
          </div>
          <div className="flex items-center gap-1">
            {isAdmin && !editing && (
              <>
                <button type="button" title="Edit order" aria-label="Edit order" onClick={() => setEditing(true)} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" title="Delete order" aria-label="Delete order" onClick={deleteOrder} disabled={!!loading} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60">
                  {loading === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                </button>
              </>
            )}
            <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center text-slate-400 hover:text-slate-600" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        {editing ? (
          <div className="space-y-4">
            <OrderFormFields
              form={form}
              onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
              clients={clients}
              showCost={showCost}
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setEditing(false); setForm(orderToForm(order)); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">Cancel</button>
              <button type="button" onClick={saveEdit} disabled={!!loading} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
                {loading === 'save' ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <OrderDetailBody order={order} showCost={showCost} />
            {isAdmin && (
              <div className="mt-4">
                <OrderLinksSection orderId={order.id} clientId={order.clientId} links={links} onLinksChange={setLinks} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function formatMoney(amount: number, currency = 'TTD') {
  return `${currency} ${Number(amount).toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(value?: string | null) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ORDER_STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SHIPPING_STAGE_COLORS[stage] ?? 'bg-slate-100 text-slate-600'}`}>
      {SHIPPING_STAGE_LABELS[stage] ?? stage}
    </span>
  );
}

export function OrderDetailBody({ order, showCost }: { order: OrderView; showCost?: boolean }) {
  const trackingUrl = getTrackingUrl(order.trackingNumber, order.vendor);

  return (
    <div className="space-y-4 text-sm">
      <ShipmentJourney shippingStage={order.shippingStage} />

      {(order.locationHistory?.length ?? 0) > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Location history</p>
          <ul className="space-y-2 rounded-xl border border-slate-200 bg-white">
            {[...(order.locationHistory ?? [])].reverse().map((entry, index) => (
              <li key={index} className="border-b border-slate-100 px-4 py-3 last:border-0">
                <p className="font-medium text-slate-900">{entry.location ?? entry.stage ?? 'Update'}</p>
                <p className="text-xs text-slate-500">
                  {[
                    entry.stage ? SHIPPING_STAGE_LABELS[entry.stage] ?? entry.stage : null,
                    entry.timestamp ? formatDate(entry.timestamp) : null,
                    entry.source ? `via ${entry.source}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={order.status} />
        <StageBadge stage={order.shippingStage} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Order number" value={<OrderLink id={order.id} label={order.orderNumber} />} />
        {order.client?.name && (
          <Info
            label="Client"
            value={
              <ClientLink
                id={order.clientId}
                label={order.client.name}
                className="text-slate-900 hover:text-indigo-700"
              />
            }
          />
        )}
        <Info label="Item" value={order.itemName} />
        <Info label="Vendor" value={order.vendor ?? '—'} />
        <Info label="Order date" value={formatDate(order.orderDate)} />
        <Info label="Estimated arrival" value={formatDate(order.estimatedArrival)} />
        <Info label="Delivered" value={formatDate(order.actualArrival)} />
        <Info label="Quantity" value={String(order.quantity)} />
        <Info label="Client price" value={formatMoney(order.clientPrice)} />
        {showCost && order.costPrice != null && <Info label="Cost price" value={formatMoney(order.costPrice)} />}
        {order.vendorOrderNumber && <Info label="Vendor order #" value={order.vendorOrderNumber} />}
        {order.serialNumber && <Info label="Serial number" value={order.serialNumber} />}
      </div>

      {order.description && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Description</p>
          <p className="mt-1 text-slate-700">{order.description}</p>
        </div>
      )}

      {(order.trackingNumber || order.currentLocation) && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Truck className="h-3.5 w-3.5" />
            Tracking
          </p>
          {order.trackingNumber && (
            <p className="font-medium text-slate-900">
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
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {order.currentLocation}
            </p>
          )}
        </div>
      )}

      {order.itemUrl && (
        <p>
          <a href={order.itemUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline">
            View item link
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </p>
      )}

      {order.notes && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notes</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{order.notes}</p>
        </div>
      )}

      {order.preAlertNotes && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Pre-alert notes</p>
          <p className="mt-1 whitespace-pre-wrap text-slate-700">{order.preAlertNotes}</p>
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 font-medium text-slate-900">{value}</p>
    </div>
  );
}

export function OrderDetailModal({
  order,
  showCost,
  onClose,
}: {
  order: OrderView;
  showCost?: boolean;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Order</p>
            <h2 className="text-lg font-semibold text-slate-900">{order.title}</h2>
            <p className="text-sm text-slate-500">
              #<OrderLink id={order.id} label={order.orderNumber} />
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>
        <OrderDetailBody order={order} showCost={showCost} />
      </div>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
    </div>
  );
}

export function EmptyOrdersState() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      <Package className="mx-auto h-10 w-10 text-slate-300" />
      <p className="mt-3 font-medium text-slate-700">No orders found</p>
      <p className="mt-1 text-sm text-slate-500">Orders for parts and shipments will appear here.</p>
    </div>
  );
}

export { Eye, RefreshCw, Search };
