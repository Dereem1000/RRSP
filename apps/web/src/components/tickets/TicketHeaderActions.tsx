'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FileText, Receipt } from 'lucide-react';

function accountingCreateHref(type: 'invoice' | 'quote', ticketId: string, clientId?: string) {
  const params = new URLSearchParams({ create: type, ticketId });
  if (clientId) params.set('clientId', clientId);
  return `/accounting?${params.toString()}`;
}

const btnClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700';

export function TicketHeaderActions({ role }: { role: string }) {
  const pathname = usePathname();
  const ticketId = pathname?.match(/^\/tickets\/([^/]+)$/)?.[1];
  const [clientId, setClientId] = useState('');

  useEffect(() => {
    if (!ticketId || role !== 'admin') return;
    let cancelled = false;
    fetch(`/api/tickets/${ticketId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.ticket?.clientId) {
          setClientId(data.ticket.clientId);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [ticketId, role]);

  if (role !== 'admin' || !ticketId) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href={accountingCreateHref('invoice', ticketId, clientId)} className={btnClass}>
        <Receipt className="h-3.5 w-3.5 text-indigo-600" />
        Create invoice
      </Link>
      <Link href={accountingCreateHref('quote', ticketId, clientId)} className={btnClass}>
        <FileText className="h-3.5 w-3.5 text-indigo-600" />
        Create quote
      </Link>
    </div>
  );
}
