'use client';

import Link from 'next/link';
import { Package, Ticket, Users, type LucideIcon } from 'lucide-react';
import { RRSP_MODULE_HREF, RRSP_MODULE_LABELS, type RrspModule } from '@/lib/rrsp';
import type { RrspDashboardOverview } from '@/lib/rrsp-dashboard';
import { RecentTicketsTable } from '@/components/dashboard/RecentTicketsTable';
import { TicketBreakdown } from '@/components/dashboard/TicketBreakdown';

const MODULE_ICONS: Record<RrspModule, LucideIcon> = {
  tickets: Ticket,
  orders: Package,
  parts: Package,
  sales: Ticket,
  clients: Users,
  accounting: Ticket,
  pos: Package,
};

export function RrspShopHome({
  modules,
  overview,
  isStaff = false,
}: {
  modules: RrspModule[];
  overview: RrspDashboardOverview;
  isStaff?: boolean;
}) {
  const moduleSet = new Set(modules);
  const hasTickets = moduleSet.has('tickets');
  const hasClients = moduleSet.has('clients');

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shop dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          {isStaff
            ? 'Quick links to the shop areas you can access.'
            : 'Overview of your repair shop — open any module below.'}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const href = RRSP_MODULE_HREF[module];
          if (!href) return null;
          const Icon = MODULE_ICONS[module] ?? Ticket;
          return (
            <Link
              key={module}
              href={href}
              className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-cd-300 hover:shadow-md"
            >
              <span className="rounded-xl bg-cd-50 p-2.5 text-cd-600">
                <Icon className="h-5 w-5" />
              </span>
              <span className="font-semibold text-slate-900">{RRSP_MODULE_LABELS[module]}</span>
            </Link>
          );
        })}
      </div>

      {hasTickets && (
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Shop tickets</p>
            <p className="mt-2 text-3xl font-bold text-slate-900">{overview.totalTickets}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Open</p>
            <p className="mt-2 text-3xl font-bold text-amber-600">{overview.openTickets}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">Resolved</p>
            <p className="mt-2 text-3xl font-bold text-emerald-600">{overview.resolvedTickets}</p>
          </div>
        </div>
      )}

      {hasTickets && overview.recentTickets.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <RecentTicketsTable
            tickets={overview.recentTickets}
            title="Recent shop tickets"
            viewAllHref="/rrsp/tickets"
            ticketBasePath="/rrsp/tickets"
            clientBasePath={hasClients ? '/rrsp/clients' : '/rrsp/tickets'}
            clientColumnLabel="Customer"
          />
          <TicketBreakdown breakdown={overview.ticketBreakdown} title="Shop ticket status" />
        </div>
      )}
    </div>
  );
}
