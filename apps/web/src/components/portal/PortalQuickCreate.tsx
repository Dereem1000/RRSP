'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Package, Ticket } from 'lucide-react';
import { CreateTicketModal } from '@/components/tickets/CreateTicketModal';
import {
  OrderFormModal,
  emptyOrderForm,
  type OrderFormValues,
} from '@/components/orders/order-ui';
import type { ClientPickerOption } from '@/lib/client-picker';
import { mapClientToPickerOption } from '@/lib/client-picker';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import type { PortalRrspAccess } from '@/components/PortalShell';

type TechnicianOption = { id: number; firstName: string; lastName: string; username: string };

export function PortalQuickCreate({
  user,
  rrspAccess = null,
}: {
  user: { id: number; role: string };
  rrspAccess?: PortalRrspAccess;
}) {
  const pathname = usePathname();
  const { askToEmailClient } = useClientEmailPolicy();
  const onRrsp = Boolean(pathname?.startsWith('/rrsp'));
  const isStaff = user.role === 'admin' || user.role === 'technician';
  const isShopOperator = user.role === 'client' && onRrsp && Boolean(rrspAccess?.enabled);

  const canTicket =
    isStaff || (isShopOperator && (rrspAccess?.modules ?? []).includes('tickets'));
  const canOrder =
    user.role === 'admin' ||
    (isShopOperator && (rrspAccess?.modules ?? []).includes('orders'));

  const [showTicket, setShowTicket] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [clients, setClients] = useState<ClientPickerOption[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [createForm, setCreateForm] = useState<OrderFormValues>(() => emptyOrderForm());
  const [createError, setCreateError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const loadPickerData = useCallback(async () => {
    try {
      const [clientsRes, techRes] = await Promise.all([
        fetch('/api/clients'),
        isStaff ? fetch('/api/users/technicians') : Promise.resolve(null),
      ]);
      if (clientsRes.ok) {
        const data = await clientsRes.json();
        const list = (data.clients ?? data.items ?? [])
          .map((c: Record<string, unknown>) =>
            mapClientToPickerOption({
              id: String(c.id),
              name: String(c.name ?? ''),
              companyName: (c.companyName as string) ?? null,
              phone: (c.phone as string) ?? null,
              email: (c.email as string) ?? null,
              address: (c.address as string) ?? null,
              serviceLevel: (c.serviceLevel as string) ?? null,
              priorityLevel: (c.priorityLevel as string) ?? null,
              contactPerson: (c.contactPerson as string) ?? null,
            })
          )
          .sort((a: ClientPickerOption, b: ClientPickerOption) =>
            (a.companyName || a.name || '').localeCompare(b.companyName || b.name || '', undefined, {
              sensitivity: 'base',
            })
          );
        setClients(list);
      }
      if (techRes?.ok) {
        const data = await techRes.json();
        setTechnicians(data.technicians ?? data.users ?? []);
      }
    } catch {
      /* ignore — modal can still open with empty list */
    }
  }, [isStaff]);

  useEffect(() => {
    if (showTicket || showOrder) void loadPickerData();
  }, [showTicket, showOrder, loadPickerData]);

  if (!canTicket && !canOrder) return null;

  async function submitOrder() {
    if (!createForm.clientId.trim()) {
      setCreateError('Please select a customer.');
      return;
    }
    setLoading(true);
    setCreateError('');
    try {
      const sendEmail = askToEmailClient('Email the customer about this new order?');
      const costNum = Number(createForm.costPrice);
      const skipUsCost =
        isShopOperator && (createForm.costPrice === '' || Number.isNaN(costNum));
      const res = await fetch('/api/msp/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: createForm.clientId,
          title: createForm.title,
          itemName: createForm.itemName,
          costPrice: skipUsCost ? 0 : costNum,
          skipUsCost,
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
          serialNumber: createForm.serialNumber || null,
          notes: createForm.notes || null,
          sendEmail,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create order');
      setShowOrder(false);
      setCreateForm(emptyOrderForm());
      setNotice(
        data.ticket?.ticketNumber
          ? `Order created · ticket ${data.ticket.ticketNumber}`
          : data.message || 'Order created'
      );
      window.setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setLoading(false);
    }
  }

  const btnClass =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700';

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {canTicket && (
          <button
            type="button"
            className={btnClass}
            onClick={() => setShowTicket(true)}
          >
            <Ticket className="h-3.5 w-3.5 text-indigo-600" />
            New ticket
          </button>
        )}
        {canOrder && (
          <button
            type="button"
            className={btnClass}
            onClick={() => {
              setCreateForm(emptyOrderForm());
              setCreateError('');
              setShowOrder(true);
            }}
          >
            <Package className="h-3.5 w-3.5 text-indigo-600" />
            New order
          </button>
        )}
        {notice && (
          <span className="rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-800">{notice}</span>
        )}
      </div>

      {showTicket && (
        <CreateTicketModal
          clients={clients}
          technicians={technicians}
          clientMode={false}
          canAddClient={isStaff || isShopOperator}
          shopMode={isShopOperator}
          pathPrefix={isShopOperator ? '/rrsp' : ''}
          onClose={() => setShowTicket(false)}
        />
      )}

      {showOrder && (
        <OrderFormModal
          title="New order"
          isNewOrder
          form={createForm}
          onChange={(patch) => setCreateForm((f) => ({ ...f, ...patch }))}
          clients={clients}
          showCost={user.role === 'admin' || isShopOperator}
          loading={loading}
          error={createError}
          onClose={() => setShowOrder(false)}
          onSubmit={() => void submitOrder()}
          allowSkipUsCost={isShopOperator}
        />
      )}
    </>
  );
}

/** Compact trigger for mobile chrome (+ menu). */
export function PortalQuickCreateMenu({
  user,
  rrspAccess = null,
}: {
  user: { id: number; role: string };
  rrspAccess?: PortalRrspAccess;
}) {
  return <PortalQuickCreate user={user} rrspAccess={rrspAccess} />;
}
