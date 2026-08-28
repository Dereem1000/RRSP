'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Package, Save, CheckCircle2, AlertTriangle } from 'lucide-react';
import { ClientSearchSelect } from '@/components/clients/ClientSearchSelect';
import { TicketStatusBadge } from './TicketStatusBadge';
import { TicketFormFields, formDataToTicketPayload } from './TicketFormFields';
import { COMMENT_TYPES } from '@/lib/ticket-constants';
import { ClientLink, OrderLink, TicketLink } from '@/components/links/DocumentLinks';
import { OrderFormModal, StageBadge, StatusBadge, emptyOrderForm, type OrderFormValues } from '@/components/orders/order-ui';
import { buildTicketOrderPrefill } from '@/lib/ticket-order-prefill';
import { isImportedItemPlaceholder, type SelectedInvoiceOrderSource, type TicketInvoiceLineItem } from '@/lib/ticket-invoice-order';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import type { ClientPickerOption } from '@/lib/client-picker';

type TicketData = {
  id: string;
  ticketNumber: string;
  clientName: string;
  clientId?: string | null;
  clientContactNumber?: string | null;
  issue: string;
  title?: string | null;
  location: string;
  deviceType: string;
  deviceModel?: string | null;
  serialNumber?: string | null;
  status: string;
  technician: string;
  notes?: string | null;
  priority?: string | null;
  category?: string | null;
  dueDate?: string | null;
  subscription?: string | null;
  dateCreated: string;
  lastUpdated: string;
  assignedTo?: number | null;
  isActive?: number;
  tags?: unknown[];
  resolutionNotes?: string | null;
  estimatedHours?: number | null;
  actualHours?: number | null;
  estimatedCost?: number | null;
  actualCost?: number | null;
  client?: { email?: string; phone?: string };
};

type Comment = {
  id: string;
  comment: string;
  commentType: string;
  authorName: string;
  timestamp: string;
  isInternal?: number;
  linkedOrderId?: string | null;
};

type LinkedOrder = {
  id: string;
  orderNumber: string;
  title: string;
  itemName: string;
  status: string;
  shippingStage: string;
  clientPrice: number;
  trackingNumber?: string | null;
  vendor?: string | null;
};

type Technician = { id: number; firstName: string; lastName: string; username: string };

export function TicketDetailClient({
  ticket: initial,
  comments: initialComments,
  technicians,
  clients = [],
  userRole,
  linkedOrders: initialLinkedOrders = [],
  invoiceOrderItems = [],
}: {
  ticket: TicketData;
  comments: Comment[];
  technicians: Technician[];
  clients?: ClientPickerOption[];
  userRole: string;
  linkedOrders?: LinkedOrder[];
  invoiceOrderItems?: TicketInvoiceLineItem[];
}) {
  const router = useRouter();
  const { askToEmailClient } = useClientEmailPolicy();
  const isStaff = userRole === 'admin' || userRole === 'technician';
  const isAdmin = userRole === 'admin';

  const [ticket, setTicket] = useState(initial);
  const [comments, setComments] = useState(initialComments);
  const [linkedOrders, setLinkedOrders] = useState(initialLinkedOrders);
  const [clientId, setClientId] = useState(initial.clientId ?? '');
  const [commentText, setCommentText] = useState('');
  const [commentType, setCommentType] = useState('update');
  const [isInternal, setIsInternal] = useState(false);
  const [resolution, setResolution] = useState('');
  const [resolveHours, setResolveHours] = useState('');
  const [escalationReason, setEscalationReason] = useState('');
  const [escalatedToId, setEscalatedToId] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderForm, setOrderForm] = useState<OrderFormValues>(() => emptyOrderForm(initial.clientId ?? ''));
  const [orderCommentId, setOrderCommentId] = useState<string | null>(null);
  const [orderError, setOrderError] = useState('');
  const [selectedInvoiceSource, setSelectedInvoiceSource] = useState<SelectedInvoiceOrderSource | null>(null);

  const formDefaults = {
    issue: ticket.issue,
    title: ticket.title,
    clientContactNumber: ticket.clientContactNumber,
    notes: ticket.notes,
    priority: ticket.priority,
    category: ticket.category,
    status: ticket.status,
    isActive: ticket.isActive ?? 1,
    location: ticket.location,
    subscription: ticket.subscription,
    deviceType: ticket.deviceType,
    deviceModel: ticket.deviceModel,
    serialNumber: ticket.serialNumber,
    dueDate: ticket.dueDate,
    estimatedHours: ticket.estimatedHours,
    actualHours: ticket.actualHours,
    estimatedCost: ticket.estimatedCost,
    actualCost: ticket.actualCost,
    tags: ticket.tags,
  };

  async function saveTicket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isStaff && !clientId) {
      setError('Please select a client.');
      return;
    }
    setLoading('save');
    setError('');
    setMessage('');
    try {
      const form = new FormData(e.currentTarget);
      const payload = formDataToTicketPayload(form);
      if (isStaff) payload.clientId = clientId;
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Update failed');
      setTicket(data.ticket);
      if (data.ticket.clientId) setClientId(data.ticket.clientId);
      setMessage('Ticket updated');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading('');
    }
  }

  async function resolveTicket() {
    if (!resolution.trim()) {
      setError('Enter resolution notes');
      return;
    }
    setLoading('resolve');
    setError('');
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution,
          actualHours: resolveHours || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Resolve failed');
      setTicket(data.ticket);
      setResolution('');
      setResolveHours('');
      setMessage('Ticket resolved');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Resolve failed');
    } finally {
      setLoading('');
    }
  }

  async function escalateTicket() {
    if (!escalationReason.trim()) {
      setError('Enter escalation reason');
      return;
    }
    setLoading('escalate');
    setError('');
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: escalationReason,
          escalatedToId: escalatedToId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Escalation failed');
      setTicket(data.ticket);
      setEscalationReason('');
      setEscalatedToId('');
      setMessage('Ticket escalated');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Escalation failed');
    } finally {
      setLoading('');
    }
  }

  async function addComment(e: FormEvent) {
    e.preventDefault();
    if (!commentText.trim()) return;
    const postedCommentType = isStaff ? commentType : 'general';
    setLoading('comment');
    setError('');
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          comment: commentText,
          commentType: postedCommentType,
          isInternal: isStaff ? isInternal : false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Comment failed');
      setComments([data.comment, ...comments]);
      setCommentText('');
      const ticketRes = await fetch(`/api/tickets/${ticket.id}`);
      const ticketData = await ticketRes.json();
      if (ticketRes.ok) setTicket(ticketData.ticket);
      router.refresh();

      if (postedCommentType === 'order_part' && isAdmin) {
        if (!ticket.clientId && !clientId) {
          setError('Comment posted. Select a client on the ticket before creating the order.');
        } else {
          openOrderModalForComment(data.comment);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comment failed');
    } finally {
      setLoading('');
    }
  }

  function openOrderModalForComment(comment: Comment) {
    const activeClientId = ticket.clientId ?? clientId;
    if (!activeClientId) {
      setError('Select a client on this ticket before creating an order.');
      return;
    }
    setOrderCommentId(comment.id);
    setSelectedInvoiceSource(null);
    setOrderForm(
      buildTicketOrderPrefill(
        {
          id: ticket.id,
          ticketNumber: ticket.ticketNumber,
          clientId: activeClientId,
          issue: ticket.issue,
          title: ticket.title,
          notes: ticket.notes,
          deviceType: ticket.deviceType,
          deviceModel: ticket.deviceModel,
        },
        { comment: comment.comment }
      )
    );
    setOrderError('');
    setShowOrderModal(true);
  }

  async function createOrderFromComment() {
    const activeClientId = ticket.clientId ?? clientId;
    if (!activeClientId) {
      setOrderError('A client is required before creating an order.');
      return;
    }
    if (!orderForm.title.trim() || !orderForm.itemName.trim()) {
      setOrderError('Title and item name are required.');
      return;
    }
    const clientPrice = Number(orderForm.clientPrice);
    if (!Number.isFinite(clientPrice) || clientPrice < 0) {
      setOrderError('Enter a valid client price, or select an invoice line to apply pricing.');
      return;
    }
    if (
      !selectedInvoiceSource &&
      (orderForm.costPrice === '' || Number.isNaN(Number(orderForm.costPrice)))
    ) {
      setOrderError('US cost is required unless you apply pricing from an invoice line.');
      return;
    }

    setLoading('order');
    setOrderError('');
    try {
      const sendEmail = askToEmailClient('Email the client about this new order?');
      const res = await fetch('/api/msp/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: activeClientId,
          title: orderForm.title,
          itemName: orderForm.itemName,
          costPrice:
            orderForm.costPrice === '' || Number.isNaN(Number(orderForm.costPrice))
              ? undefined
              : Number(orderForm.costPrice),
          clientPrice: Number(orderForm.clientPrice),
          quantity: Number(orderForm.quantity) || 1,
          description: orderForm.description || null,
          itemUrl: orderForm.itemUrl || null,
          vendor: orderForm.vendor || null,
          vendorOrderNumber: orderForm.vendorOrderNumber || null,
          trackingNumber: orderForm.trackingNumber || null,
          orderDate: orderForm.orderDate,
          estimatedArrival: orderForm.estimatedArrival || null,
          status: orderForm.status,
          shippingStage: orderForm.shippingStage,
          currentLocation: orderForm.currentLocation || null,
          isLoggedInPreAlerts: orderForm.isLoggedInPreAlerts,
          preAlertNotes: orderForm.preAlertNotes || null,
          serialNumber: orderForm.serialNumber || null,
          notes: orderForm.notes || null,
          sendEmail,
          autoCreateTicket: false,
          linkToTicketId: ticket.id,
          sourceCommentId: orderCommentId,
          skipUsCost: Boolean(selectedInvoiceSource),
          syncInvoiceLineItem:
            selectedInvoiceSource &&
            selectedInvoiceSource.wasImportedPlaceholder &&
            orderForm.itemName.trim() &&
            !isImportedItemPlaceholder(orderForm.itemName)
              ? {
                  invoiceId: selectedInvoiceSource.invoiceId,
                  itemIndex: selectedInvoiceSource.itemIndex,
                  itemName: orderForm.itemName.trim(),
                }
              : undefined,
          linkInvoice: selectedInvoiceSource
            ? {
                invoiceId: selectedInvoiceSource.invoiceId,
                invoiceNumber: selectedInvoiceSource.invoiceNumber,
              }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create order');

      if (orderCommentId) {
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === orderCommentId
              ? { ...comment, linkedOrderId: data.order?.id ?? comment.linkedOrderId }
              : comment
          )
        );
      }

      if (data.order?.id) {
        const created = data.order;
        setLinkedOrders((prev) => {
          if (prev.some((order) => order.id === created.id)) return prev;
          return [
            {
              id: created.id,
              orderNumber: created.orderNumber,
              title: created.title,
              itemName: created.itemName,
              status: created.status,
              shippingStage: created.shippingStage,
              clientPrice: Number(created.clientPrice ?? 0),
              trackingNumber: created.trackingNumber ?? null,
              vendor: created.vendor ?? null,
            },
            ...prev,
          ];
        });
      }

      setShowOrderModal(false);
      setOrderCommentId(null);
      setSelectedInvoiceSource(null);
      setOrderForm(emptyOrderForm(activeClientId));
      setMessage(data.message ?? 'Order created and linked to this ticket.');
      router.refresh();
    } catch (err) {
      setOrderError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setLoading('');
    }
  }

  const tagsDisplay = Array.isArray(ticket.tags) ? (ticket.tags as string[]).join(', ') : '';

  return (
    <div className="space-y-6">
      <Link
        href="/tickets"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to tickets
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-sm text-indigo-600">
            <TicketLink id={ticket.id} label={ticket.ticketNumber} className="font-mono text-sm text-indigo-600" />
          </p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">{ticket.issue}</h1>
          <p className="mt-2 text-sm text-slate-500">
            <ClientLink id={ticket.clientId} label={ticket.clientName} className="text-sm text-slate-500 hover:text-indigo-700" />
            {ticket.clientContactNumber ? ` · ${ticket.clientContactNumber}` : ''}
            {ticket.client?.phone && !ticket.clientContactNumber ? ` · ${ticket.client.phone}` : ''}
          </p>
        </div>
        <TicketStatusBadge status={ticket.status} />
      </div>

      {linkedOrders.length > 0 && (
        <section className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Linked orders</h2>
          </div>
          <div className="mt-4 space-y-3">
            {linkedOrders.map((order) => (
              <div
                key={order.id}
                className="rounded-xl border border-white/80 bg-white px-4 py-3 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <OrderLink id={order.id} label={order.orderNumber} />
                    <p className="mt-1 text-sm font-medium text-slate-900">{order.title}</p>
                    <p className="text-sm text-slate-600">{order.itemName}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {order.vendor ? `${order.vendor}` : 'No vendor'}
                      {order.trackingNumber ? ` · Tracking ${order.trackingNumber}` : ''}
                      {isStaff ? ` · TTD ${order.clientPrice}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={order.status} />
                    <StageBadge stage={order.shippingStage} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {(error || message) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || message}
        </div>
      )}

      {isStaff && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Edit ticket</h2>
          <form key={ticket.lastUpdated} onSubmit={saveTicket} className="mt-3 space-y-3">
            <div className="grid gap-3 lg:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">
                  Client <span className="text-red-500">*</span>
                </span>
                <ClientSearchSelect
                  clients={clients}
                  value={clientId}
                  onChange={setClientId}
                  name="clientId"
                  required
                  placeholder="Type client or company name…"
                  inputClassName="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Assign to</span>
                <select
                  name="assignedTo"
                  defaultValue={String(ticket.assignedTo ?? '')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <TicketFormFields
              layout="wide"
              defaults={formDefaults}
              showStatus
              showActive
              showFinancials
            />

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={loading === 'save'}
                className="inline-flex min-w-[10rem] items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {loading === 'save' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save changes
              </button>
            </div>
          </form>

          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
            <h3 className="font-semibold text-emerald-900">Resolve</h3>
            <div className="mt-3 grid gap-3 lg:grid-cols-12 lg:items-end">
              <label className="block lg:col-span-7">
                <span className="mb-1 block text-sm font-medium text-emerald-900">Resolution summary</span>
                <textarea
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                  rows={2}
                  placeholder="What was done to fix this ticket?"
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block lg:col-span-2">
                <span className="mb-1 block text-sm font-medium text-emerald-900">Actual hours</span>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={resolveHours}
                  onChange={(e) => setResolveHours(e.target.value)}
                  placeholder={ticket.actualHours != null ? String(ticket.actualHours) : '0'}
                  className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={resolveTicket}
                disabled={loading === 'resolve'}
                className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 lg:col-span-3"
              >
                <CheckCircle2 className="h-4 w-4" />
                Mark resolved
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <h3 className="font-semibold text-amber-900">Escalate</h3>
            <div className="mt-3 grid gap-3 lg:grid-cols-12 lg:items-end">
              <label className="block lg:col-span-5">
                <span className="mb-1 block text-sm font-medium text-amber-900">Reason</span>
                <textarea
                  value={escalationReason}
                  onChange={(e) => setEscalationReason(e.target.value)}
                  rows={2}
                  placeholder="Why does this need escalation?"
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="block lg:col-span-4">
                <span className="mb-1 block text-sm font-medium text-amber-900">Reassign to (optional)</span>
                <select
                  value={escalatedToId}
                  onChange={(e) => setEscalatedToId(e.target.value)}
                  className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Keep current assignee</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.firstName} {t.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={escalateTicket}
                disabled={loading === 'escalate'}
                className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 lg:col-span-3"
              >
                <AlertTriangle className="h-4 w-4" />
                Escalate
              </button>
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900">Overview</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Client</dt>
                <dd className="mt-0.5 text-slate-800">
                  <ClientLink
                    id={ticket.clientId}
                    label={ticket.clientName}
                    className="font-medium hover:text-indigo-700"
                  />
                  {ticket.clientContactNumber ? ` · ${ticket.clientContactNumber}` : ''}
                </dd>
              </div>
              <Detail label="Category" value={ticket.category || 'general'} />
              <Detail label="Location" value={ticket.location} />
              <Detail label="Device" value={ticket.deviceType} />
              <Detail label="Model" value={ticket.deviceModel || '—'} />
              <Detail label="Serial" value={ticket.serialNumber || '—'} />
              <Detail label="Subscription" value={ticket.subscription || '—'} />
              <Detail label="Technician" value={ticket.technician} />
              <Detail label="Due date" value={ticket.dueDate?.slice(0, 10) || '—'} />
              <Detail label="Priority" value={ticket.priority ?? 'medium'} />
              <Detail label="Created" value={ticket.dateCreated} />
              <Detail label="Updated" value={ticket.lastUpdated} />
              {ticket.estimatedHours != null && (
                <Detail label="Est. hours" value={String(ticket.estimatedHours)} />
              )}
              {ticket.actualHours != null && (
                <Detail label="Actual hours" value={String(ticket.actualHours)} />
              )}
              {ticket.estimatedCost != null && (
                <Detail label="Est. cost" value={`TTD ${ticket.estimatedCost}`} />
              )}
              {ticket.actualCost != null && (
                <Detail label="Actual cost" value={`TTD ${ticket.actualCost}`} />
              )}
              {tagsDisplay && <Detail label="Tags" value={tagsDisplay} />}
            </dl>
            {ticket.notes && (
              <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
                <p className="mb-1 font-medium text-slate-900">Notes</p>
                <p className="whitespace-pre-wrap">{ticket.notes}</p>
              </div>
            )}
            {ticket.resolutionNotes && (
              <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="mb-1 font-medium">Resolution</p>
                <p className="whitespace-pre-wrap">{ticket.resolutionNotes}</p>
              </div>
            )}
          </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-slate-900">Comments</h2>
            <form onSubmit={addComment} className="mt-4 space-y-3">
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={3}
                placeholder="Add a comment..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
              {isStaff && (
                <div className="flex flex-wrap gap-3">
                  <select
                    value={commentType}
                    onChange={(e) => setCommentType(e.target.value)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  >
                    {COMMENT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={isInternal}
                      onChange={(e) => setIsInternal(e.target.checked)}
                    />
                    Internal only
                  </label>
                </div>
              )}
              <button
                type="submit"
                disabled={loading === 'comment'}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading === 'comment' ? 'Posting…' : 'Post comment'}
              </button>
            </form>

            <div className="mt-6 space-y-3">
              {comments.length === 0 ? (
                <p className="text-sm text-slate-400">No comments yet</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{c.authorName}</span>
                      <span>·</span>
                      <span>{c.commentType}</span>
                      {c.isInternal ? (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">Internal</span>
                      ) : null}
                      <span>·</span>
                      <span>{c.timestamp}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{c.comment}</p>
                    {c.commentType === 'order_part' && c.linkedOrderId ? (
                      <p className="mt-3 text-sm text-slate-600">
                        Linked order:{' '}
                        <OrderLink id={c.linkedOrderId} label="View order" className="font-medium text-indigo-700" />
                      </p>
                    ) : null}
                    {isAdmin && c.commentType === 'order_part' && !c.linkedOrderId ? (
                      <button
                        type="button"
                        onClick={() => openOrderModalForComment(c)}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                      >
                        <Package className="h-3.5 w-3.5" />
                        New order
                      </button>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
      </div>

      {showOrderModal && isAdmin && (
        <OrderFormModal
          title="New order"
          isNewOrder
          form={orderForm}
          onChange={(patch) => setOrderForm((form) => ({ ...form, ...patch }))}
          clients={clients}
          showCost={isAdmin}
          loading={loading === 'order'}
          error={orderError}
          linkToTicket={{ ticketNumber: ticket.ticketNumber }}
          invoiceOrderItems={invoiceOrderItems}
          selectedInvoiceSource={selectedInvoiceSource}
          onInvoiceSourceChange={setSelectedInvoiceSource}
          allowSkipUsCost={Boolean(selectedInvoiceSource)}
          onClose={() => {
            setShowOrderModal(false);
            setOrderCommentId(null);
            setSelectedInvoiceSource(null);
            setOrderError('');
          }}
          onSubmit={createOrderFromComment}
        />
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 capitalize text-slate-800">{value}</dd>
    </div>
  );
}
