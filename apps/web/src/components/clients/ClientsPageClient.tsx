'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Package, Plus, Receipt, Search, Ticket } from 'lucide-react';
import { CreateClientModal } from './CreateClientModal';
import { CLIENT_STATUSES, SERVICE_LEVELS, SERVICE_LEVEL_COLORS, STATUS_COLORS } from '@/lib/client-constants';
import type { ClientLicenseBadge } from '@/lib/client-license-map';

export type ClientRow = {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
  phone?: string | null;
  status: string;
  serviceLevel?: string | null;
  supportTier: string;
  monthlyRate?: number | null;
  priorityLevel?: string | null;
  contactPerson?: string | null;
  isActive?: boolean;
};

const LICENSE_BADGE_COLORS: Record<ClientLicenseBadge['status'], string> = {
  Active: 'bg-emerald-50 text-emerald-700',
  Pending: 'bg-amber-50 text-amber-800',
  'Not Found': 'bg-red-50 text-red-700',
  'Not Required': 'bg-slate-100 text-slate-500',
  'N/A': 'bg-slate-50 text-slate-400',
  Unavailable: 'bg-slate-100 text-slate-500',
};

function sameContactLabel(a?: string | null, b?: string | null) {
  const left = a?.trim().toLowerCase();
  const right = b?.trim().toLowerCase();
  return Boolean(left && right && left === right);
}

function ClientContactCell({ client }: { client: ClientRow }) {
  const showContactPerson =
    client.contactPerson?.trim() &&
    !sameContactLabel(client.contactPerson, client.name) &&
    !sameContactLabel(client.contactPerson, client.companyName);
  const phone = client.phone?.trim();

  if (!showContactPerson && !phone) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <>
      {showContactPerson ? <p className="text-slate-600">{client.contactPerson}</p> : null}
      {phone ? <p className={showContactPerson ? 'text-xs text-slate-400' : 'text-slate-600'}>{phone}</p> : null}
    </>
  );
}

function ClientRowQuickActions({ clientId, userRole }: { clientId: string; userRole: string }) {
  const isStaff = userRole === 'admin' || userRole === 'technician';
  const isAdmin = userRole === 'admin';
  if (!isStaff) return null;

  const btnClass =
    'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700';

  return (
    <div className="flex flex-wrap gap-1">
      <Link
        href={`/tickets?create=1&clientId=${clientId}`}
        className={btnClass}
        title="New ticket"
        aria-label="New ticket for this client"
      >
        <Ticket className="h-3.5 w-3.5" />
      </Link>
      <Link
        href={`/orders?create=1&clientId=${clientId}`}
        className={btnClass}
        title="New order"
        aria-label="New order for this client"
      >
        <Package className="h-3.5 w-3.5" />
      </Link>
      {isAdmin && (
        <>
          <Link
            href={`/accounting?create=invoice&clientId=${clientId}`}
            className={btnClass}
            title="New invoice"
            aria-label="New invoice for this client"
          >
            <Receipt className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={`/accounting?create=quote&clientId=${clientId}`}
            className={btnClass}
            title="New quote"
            aria-label="New quote for this client"
          >
            <FileText className="h-3.5 w-3.5" />
          </Link>
        </>
      )}
    </div>
  );
}

export function ClientsPageClient({
  clients,
  licenseMap = {},
  userRole,
}: {
  clients: ClientRow[];
  licenseMap?: Record<string, ClientLicenseBadge>;
  userRole: string;
}) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = userRole === 'admin';

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const matchesStatus = statusFilter === 'all' || c.status === statusFilter;
      const matchesService =
        serviceFilter === 'all' ||
        (serviceFilter === 'none' ? !c.serviceLevel : c.serviceLevel === serviceFilter);
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.companyName ?? '').toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        (c.phone ?? '').toLowerCase().includes(q) ||
        (c.contactPerson ?? '').toLowerCase().includes(q);
      return matchesStatus && matchesService && matchesSearch;
    });
  }, [clients, search, statusFilter, serviceFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clients..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">All statuses</option>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">All plans</option>
            <option value="none">No plan</option>
            {SERVICE_LEVELS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              Add client
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="px-4 py-3.5 font-semibold text-slate-600">Client</th>
              <th className="px-4 py-3.5 font-semibold text-slate-600">Contact</th>
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 md:table-cell">Email</th>
              <th className="px-4 py-3.5 font-semibold text-slate-600">Plan</th>
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 lg:table-cell">Support</th>
              <th className="px-4 py-3.5 font-semibold text-slate-600">Status</th>
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 lg:table-cell">License</th>
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 sm:table-cell">Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                  No clients found
                </td>
              </tr>
            ) : (
              filtered.map((c) => (
                <tr key={c.id} className="transition hover:bg-slate-50/50">
                  <td className="px-4 py-4">
                    <Link href={`/clients/${c.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                      {c.name}
                    </Link>
                    {c.companyName && !sameContactLabel(c.companyName, c.name) && (
                      <p className="text-xs text-slate-500">{c.companyName}</p>
                    )}
                    <div className="mt-2">
                      <ClientRowQuickActions clientId={c.id} userRole={userRole} />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <ClientContactCell client={c} />
                  </td>
                  <td className="hidden px-4 py-4 text-slate-600 md:table-cell">{c.email}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        SERVICE_LEVEL_COLORS[c.serviceLevel ?? ''] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {c.serviceLevel ?? 'none'}
                    </span>
                  </td>
                  <td className="hidden px-4 py-4 capitalize text-slate-600 lg:table-cell">{c.supportTier}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                        STATUS_COLORS[c.status] ?? 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {c.status}
                    </span>
                  </td>
                  <td className="hidden px-4 py-4 lg:table-cell">
                    {(() => {
                      const badge = licenseMap[c.id];
                      if (!badge || badge.status === 'N/A') {
                        return <span className="text-xs text-slate-400">{badge?.label ?? '—'}</span>;
                      }
                      return (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${LICENSE_BADGE_COLORS[badge.status]}`}
                        >
                          {badge.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="hidden px-4 py-4 text-slate-600 sm:table-cell">
                    {c.monthlyRate && c.monthlyRate > 0 ? `TTD ${c.monthlyRate}` : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateClientModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
