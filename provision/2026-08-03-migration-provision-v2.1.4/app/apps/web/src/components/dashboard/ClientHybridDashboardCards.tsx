'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  Ticket,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  CreditCard,
  Users,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { RecentTicket, TicketStatusBreakdown } from '@/lib/dashboard';
import type { RrspModule } from '@/lib/rrsp';
import { RecentTicketsTable } from '@/components/dashboard/RecentTicketsTable';
import { TicketBreakdown } from '@/components/dashboard/TicketBreakdown';

type LegacyStats = {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  invoiceCount: number;
  pendingInvoices: number;
};

type ShopStats = {
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  customers: number;
  activeRequests: number;
  pendingIncomingRequests: number;
  pendingOutgoingRequests: number;
};

type CardDef = {
  key: string;
  label: string;
  value: string | number;
  subtext?: string;
  href: string;
  icon: LucideIcon;
  accent: string;
  module?: RrspModule;
};

function StatLinkCard({ card }: { card: CardDef }) {
  const Icon = card.icon;
  return (
    <Link
      href={card.href}
      className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:border-cd-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cd-500"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{card.label}</p>
          <p className="mt-2 truncate text-3xl font-bold tracking-tight text-slate-900">{card.value}</p>
          {card.subtext && <p className="mt-1 text-xs text-slate-400">{card.subtext}</p>}
        </div>
        <div className={`shrink-0 rounded-xl p-2.5 ${card.accent}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Link>
  );
}

export function ClientHybridDashboardCards({
  legacy,
  shop,
  modules,
  supportTickets,
  supportBreakdown,
  shopTickets,
  shopBreakdown,
}: {
  legacy: LegacyStats;
  shop: ShopStats;
  modules: RrspModule[];
  supportTickets: RecentTicket[];
  supportBreakdown: TicketStatusBreakdown[];
  shopTickets: RecentTicket[];
  shopBreakdown: TicketStatusBreakdown[];
}) {
  const moduleSet = new Set(modules);
  const hasTickets = moduleSet.has('tickets');
  const hasClients = moduleSet.has('clients');
  const hasParts = moduleSet.has('parts');
  const hasAnyShopModule = modules.length > 0;

  const [mode, setMode] = useState<'shop' | 'support'>(hasAnyShopModule ? 'shop' : 'support');

  const shopCardDefs: CardDef[] = [
    {
      key: 'shop-tickets',
      label: 'Shop tickets',
      value: shop.totalTickets,
      href: '/rrsp/tickets',
      icon: Ticket,
      accent: 'bg-violet-50 text-violet-600',
      module: 'tickets',
    },
    {
      key: 'shop-open',
      label: 'Open shop tickets',
      value: shop.openTickets,
      href: '/rrsp/tickets',
      icon: AlertCircle,
      accent: 'bg-amber-50 text-amber-600',
      module: 'tickets',
    },
    {
      key: 'shop-resolved',
      label: 'Resolved',
      value: shop.resolvedTickets,
      href: '/rrsp/tickets',
      icon: CheckCircle2,
      accent: 'bg-emerald-50 text-emerald-600',
      module: 'tickets',
    },
    {
      key: 'customers',
      label: 'Customers',
      value: shop.customers,
      href: '/rrsp/clients',
      icon: Users,
      accent: 'bg-sky-50 text-sky-600',
      module: 'clients',
    },
    {
      key: 'requests',
      label: 'Parts requests',
      value: shop.activeRequests,
      subtext:
        shop.pendingIncomingRequests > 0
          ? `${shop.pendingIncomingRequests} incoming`
          : shop.pendingOutgoingRequests > 0
            ? `${shop.pendingOutgoingRequests} outgoing`
            : undefined,
      href:
        shop.pendingIncomingRequests > 0
          ? '/rrsp/parts?tab=incoming'
          : '/rrsp/parts?tab=outgoing',
      icon: Package,
      accent: 'bg-indigo-50 text-indigo-600',
      module: 'parts',
    },
  ];
  const shopCards = shopCardDefs.filter((card) => !card.module || moduleSet.has(card.module));

  const supportCards: CardDef[] = [
    {
      key: 'my-tickets',
      label: 'My tickets',
      value: legacy.totalTickets,
      href: '/tickets',
      icon: Ticket,
      accent: 'bg-violet-50 text-violet-600',
    },
    {
      key: 'open',
      label: 'Open tickets',
      value: legacy.openTickets,
      href: '/tickets',
      icon: AlertCircle,
      accent: 'bg-amber-50 text-amber-600',
    },
    {
      key: 'resolved',
      label: 'Resolved',
      value: legacy.resolvedTickets,
      href: '/tickets',
      icon: CheckCircle2,
      accent: 'bg-emerald-50 text-emerald-600',
    },
    {
      key: 'invoices',
      label: 'Invoices',
      value: legacy.invoiceCount,
      href: '/billing',
      icon: DollarSign,
      accent: 'bg-green-50 text-green-600',
    },
    {
      key: 'pending-invoices',
      label: 'Pending invoices',
      value: legacy.pendingInvoices,
      href: '/billing',
      icon: CreditCard,
      accent: 'bg-rose-50 text-rose-600',
    },
  ];

  const isShop = mode === 'shop' && hasAnyShopModule;
  const cards = isShop ? shopCards : supportCards;
  const showShopTicketPanels = isShop && hasTickets;
  const showSupportTicketPanels = !isShop;

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        {hasAnyShopModule && (
          <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode('shop')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === 'shop' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Shop
            </button>
            <button
              type="button"
              onClick={() => setMode('support')}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                mode === 'support' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              Support
            </button>
          </div>
        )}

        {isShop && shopCards.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
            No shop overview cards for your activated modules. Use the RRSP menu for orders, sales, or
            accounting.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {cards.map((card) => (
              <StatLinkCard key={card.key} card={card} />
            ))}
          </div>
        )}
      </div>

      {(showShopTicketPanels || showSupportTicketPanels) && (
        <div className="grid gap-6 xl:grid-cols-3 xl:items-stretch">
          <div className="xl:col-span-2">
            <RecentTicketsTable
              tickets={showShopTicketPanels ? shopTickets : supportTickets}
              title={showShopTicketPanels ? 'Recent shop tickets' : 'Recent tickets'}
              viewAllHref={showShopTicketPanels ? '/rrsp/tickets' : '/tickets'}
              ticketBasePath={showShopTicketPanels ? '/rrsp/tickets' : '/tickets'}
              clientBasePath={
                showShopTicketPanels
                  ? hasClients
                    ? '/rrsp/clients'
                    : '/rrsp/tickets'
                  : '/clients'
              }
              clientColumnLabel={showShopTicketPanels ? 'Customer' : 'Client'}
            />
          </div>
          <div className="flex h-full min-h-0 flex-col gap-4">
            <TicketBreakdown
              breakdown={showShopTicketPanels ? shopBreakdown : supportBreakdown}
              compact
              fill
              title={showShopTicketPanels ? 'Shop tickets by status' : 'Tickets by status'}
            />
          </div>
        </div>
      )}
    </div>
  );
}
