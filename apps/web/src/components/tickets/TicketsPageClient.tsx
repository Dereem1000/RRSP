'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Search, Upload, Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TicketStatusBadge } from './TicketStatusBadge';
import { CreateTicketModal } from './CreateTicketModal';
import { RESOLVED_STATUSES, TICKET_PRIORITIES, TICKET_STATUSES, formatTicketStatusLabel } from '@/lib/ticket-constants';
import type { ClientPickerOption } from '@/lib/client-picker';
import { ClientLink } from '@/components/links/DocumentLinks';

export type TicketRow = {
  id: string;
  ticketNumber: string;
  clientId?: string | null;
  clientName: string;
  isActive?: number;
  clientContactNumber?: string | null;
  issue: string;
  status: string;
  priority: string | null;
  category?: string | null;
  location?: string;
  deviceType?: string;
  dueDate?: string | null;
  technician: string;
  lastUpdated: string;
  hasUnreadClientComments?: boolean;
};

type ClientOption = ClientPickerOption;
type TechnicianOption = { id: number; firstName: string; lastName: string; username: string };

export function TicketsPageClient({
  tickets,
  userRole,
  clients,
  technicians,
  clientCanCreate = false,
}: {
  tickets: TicketRow[];
  userRole: string;
  clients: ClientOption[];
  technicians: TechnicianOption[];
  clientCanCreate?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [hideClosed, setHideClosed] = useState(true);
  const [showHidden, setShowHidden] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const isStaff = userRole === 'admin' || userRole === 'technician';
  const isAdmin = userRole === 'admin';
  const canCreate = isStaff || (userRole === 'client' && clientCanCreate);

  useEffect(() => {
    if (searchParams?.get('create') === '1' && canCreate) {
      setShowCreate(true);
    }
  }, [searchParams, canCreate]);

  const presetClientId = searchParams?.get('clientId') ?? '';

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      const isHidden = (t.isActive ?? 1) === 0;
      const matchesHidden = showHidden || !isHidden;
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesPriority =
        priorityFilter === 'all' || (t.priority ?? 'medium') === priorityFilter;
      const matchesClosed = !hideClosed || !RESOLVED_STATUSES.includes(t.status);
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        t.ticketNumber.toLowerCase().includes(q) ||
        t.clientName.toLowerCase().includes(q) ||
        t.issue.toLowerCase().includes(q) ||
        (t.location ?? '').toLowerCase().includes(q) ||
        (t.deviceType ?? '').toLowerCase().includes(q) ||
        (t.category ?? '').toLowerCase().includes(q);
      return matchesHidden && matchesStatus && matchesPriority && matchesSearch && matchesClosed;
    });
  }, [tickets, search, statusFilter, priorityFilter, hideClosed, showHidden]);

  async function handleImport(file: File) {
    setImporting(true);
    setImportMessage('');
    try {
      const form = new FormData();
      form.append('csvFile', file);
      const res = await fetch('/api/tickets/import-csv', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Import failed');
      setImportMessage(data.message || `Imported ${data.processed} ticket(s)`);
      router.refresh();
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-4">
      {importMessage && (
        <div className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-800">{importMessage}</div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets, client, device..."
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hideClosed}
              disabled={showHidden}
              onChange={(e) => {
                const checked = e.target.checked;
                setHideClosed(checked);
                if (checked) setShowHidden(false);
              }}
            />
            Hide closed
          </label>

          {isStaff && (
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={showHidden}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowHidden(checked);
                  if (checked) setHideClosed(false);
                }}
              />
              Show hidden
            </label>
          )}

          <select
            value={statusFilter}
            onChange={(e) => {
              const value = e.target.value;
              setStatusFilter(value);
              if (value !== 'all' && RESOLVED_STATUSES.includes(value)) {
                setHideClosed(false);
              }
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          >
            <option value="all">All statuses</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {formatTicketStatusLabel(s)}
              </option>
            ))}
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
          >
            <option value="all">All priorities</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          {isAdmin && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImport(file);
                }}
              />
              <button
                type="button"
                disabled={importing}
                onClick={() => fileRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Import CSV
              </button>
            </>
          )}

          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              New ticket
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/80">
              <th className="px-4 py-3.5 font-semibold text-slate-600">Ticket</th>
              {userRole !== 'client' && (
                <th className="px-4 py-3.5 font-semibold text-slate-600">Client</th>
              )}
              <th className="px-4 py-3.5 font-semibold text-slate-600">Issue</th>
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 md:table-cell">Category</th>
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 lg:table-cell">Device</th>
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 xl:table-cell">Location</th>
              <th className="px-4 py-3.5 font-semibold text-slate-600">Priority</th>
              <th className="px-4 py-3.5 font-semibold text-slate-600">Status</th>
              {userRole !== 'client' && (
                <th className="hidden px-4 py-3.5 font-semibold text-slate-600 sm:table-cell">Technician</th>
              )}
              <th className="hidden px-4 py-3.5 font-semibold text-slate-600 lg:table-cell">Due</th>
              <th className="px-4 py-3.5 font-semibold text-slate-600">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-5 py-12 text-center text-slate-400">
                  No tickets found
                </td>
              </tr>
            ) : (
              filtered.map((t) => (
                <tr key={t.id} className="transition hover:bg-slate-50/50">
                  <td className="px-4 py-4">
                    <Link
                      href={`/tickets/${t.id}`}
                      className="font-mono text-xs font-medium text-indigo-600 hover:text-indigo-800"
                    >
                      {t.ticketNumber}
                      {t.hasUnreadClientComments && (
                        <span
                          className="ml-2 inline-block h-2 w-2 rounded-full bg-rose-500"
                          title="Unread client comment"
                        />
                      )}
                    </Link>
                  </td>
                  {userRole !== 'client' && (
                    <td className="px-4 py-4">
                      <ClientLink id={t.clientId} label={t.clientName} className="font-medium text-slate-900 hover:text-indigo-700" />
                    </td>
                  )}
                  <td className="max-w-[10rem] truncate px-4 py-4 text-slate-600 sm:max-w-xs">{t.issue}</td>
                  <td className="hidden px-4 py-4 capitalize text-slate-600 md:table-cell">
                    {t.category ?? 'general'}
                  </td>
                  <td className="hidden px-4 py-4 text-slate-600 lg:table-cell">{t.deviceType ?? '—'}</td>
                  <td className="hidden px-4 py-4 text-slate-600 xl:table-cell">{t.location ?? '—'}</td>
                  <td className="px-4 py-4 capitalize text-slate-600">{t.priority ?? 'medium'}</td>
                  <td className="px-4 py-4">
                    <TicketStatusBadge status={t.status} />
                  </td>
                  {userRole !== 'client' && (
                    <td className="hidden px-4 py-4 text-slate-600 sm:table-cell">{t.technician}</td>
                  )}
                  <td className="hidden px-4 py-4 text-xs text-slate-500 lg:table-cell">
                    {t.dueDate ? t.dueDate.slice(0, 10) : '—'}
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-500">{t.lastUpdated}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateTicketModal
          clients={clients}
          technicians={technicians}
          clientMode={userRole === 'client'}
          defaultClientId={presetClientId}
          canAddClient={isStaff}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}
