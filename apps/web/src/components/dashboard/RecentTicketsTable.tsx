import Link from 'next/link';
import type { RecentTicket } from '@/lib/dashboard';
import { ClientLink, TicketLink } from '@/components/links/DocumentLinks';

const statusColors: Record<string, string> = {
  New: 'bg-blue-100 text-blue-800',
  Open: 'bg-sky-100 text-sky-800',
  'In-progress': 'bg-amber-100 text-amber-800',
  Pending: 'bg-orange-100 text-orange-800',
  Resolved: 'bg-emerald-100 text-emerald-800',
  Closed: 'bg-slate-100 text-slate-600',
  Completed: 'bg-emerald-100 text-emerald-800',
};

export function RecentTicketsTable({
  tickets,
  title = 'Recent tickets',
  viewAllHref = '/tickets',
  viewAllLabel = 'View all',
  ticketBasePath = '/tickets',
  clientBasePath = '/clients',
  clientColumnLabel = 'Client',
}: {
  tickets: RecentTicket[];
  title?: string;
  viewAllHref?: string;
  viewAllLabel?: string;
  ticketBasePath?: string;
  clientBasePath?: string;
  clientColumnLabel?: string;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <Link href={viewAllHref} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
          {viewAllLabel}
        </Link>
      </div>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            <th className="px-5 py-3 font-semibold text-slate-600">Ticket</th>
            <th className="px-5 py-3 font-semibold text-slate-600">{clientColumnLabel}</th>
            <th className="px-5 py-3 font-semibold text-slate-600">Issue</th>
            <th className="px-5 py-3 font-semibold text-slate-600">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {tickets.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-5 py-10 text-center text-slate-400">
                No tickets yet
              </td>
            </tr>
          ) : (
            tickets.map((t) => (
              <tr key={t.id} className="hover:bg-slate-50/50">
                <td className="px-5 py-3.5">
                  {ticketBasePath === '/tickets' ? (
                    <TicketLink id={t.id} label={t.ticketNumber} />
                  ) : (
                    <Link
                      href={ticketBasePath}
                      className="font-mono text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {t.ticketNumber}
                    </Link>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {clientBasePath === '/clients' ? (
                    <ClientLink
                      id={t.clientId}
                      label={t.clientName}
                      className="font-medium text-slate-900 hover:text-indigo-700"
                    />
                  ) : (
                    <Link
                      href={clientBasePath}
                      className="font-medium text-slate-900 hover:text-indigo-700"
                    >
                      {t.clientName}
                    </Link>
                  )}
                </td>
                <td className="max-w-xs truncate px-5 py-3.5 text-slate-600">{t.issue}</td>
                <td className="px-5 py-3.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      statusColors[t.status] ?? 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {t.status}
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
