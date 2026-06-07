import {
  Users,
  Building2,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Clock,
  DollarSign,
  CreditCard,
} from 'lucide-react';
import { testConnection } from '@/lib/db';
import { getDashboardOverview, formatCurrency } from '@/lib/dashboard';
import { requirePortalUser } from '@/lib/session';
import { StatCard } from '@/components/dashboard/StatCard';
import { RecentTicketsTable } from '@/components/dashboard/RecentTicketsTable';
import { TicketBreakdown } from '@/components/dashboard/TicketBreakdown';
import { SystemHealthCard } from '@/components/dashboard/SystemHealthCard';
import { RecentActivityFeed } from '@/components/dashboard/RecentActivityFeed';
import { RecentNoticesCard } from '@/components/dashboard/RecentNoticesCard';
import { SecurityStatusCard } from '@/components/dashboard/SecurityStatusCard';
import { ClientServiceCard } from '@/components/dashboard/ClientServiceCard';
import { ClientLicenseStatusCard } from '@/components/dashboard/ClientLicenseStatusCard';
import { DashboardRefreshButton } from '@/components/dashboard/DashboardRefreshButton';

export default async function DashboardPage() {
  await testConnection();
  const { user } = await requirePortalUser();
  const data = await getDashboardOverview(user.role, user.id);
  const { stats } = data;
  const isStaff = user.role === 'admin' || user.role === 'technician';
  const isAdmin = user.role === 'admin';

  const title =
    user.role === 'client'
      ? 'My dashboard'
      : user.role === 'technician'
        ? 'My work'
        : 'Dashboard';

  const subtitle =
    user.role === 'client'
      ? 'Your support tickets and service overview'
      : user.role === 'technician'
        ? 'Assigned tickets and activity summary'
        : 'System overview for Computer Dynamics MSP';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <DashboardRefreshButton />
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {isAdmin && (
          <>
            <StatCard
              label="Active users"
              value={stats.totalUsers}
              icon={Users}
              accent="bg-blue-50 text-blue-600"
            />
            <StatCard
              label="Active clients"
              value={stats.totalClients}
              icon={Building2}
              accent="bg-emerald-50 text-emerald-600"
            />
          </>
        )}

        {!isAdmin && user.role === 'client' && (
          <StatCard
            label="My tickets"
            value={stats.totalTickets}
            icon={Ticket}
            accent="bg-violet-50 text-violet-600"
          />
        )}

        {user.role === 'technician' && (
          <>
            <StatCard
              label="Assigned tickets"
              value={stats.totalTickets}
              icon={Ticket}
              accent="bg-violet-50 text-violet-600"
            />
            {data.techMetrics && (
              <>
                <StatCard
                  label="In progress"
                  value={data.techMetrics.inProgressTickets}
                  icon={Clock}
                  accent="bg-sky-50 text-sky-600"
                />
                <StatCard
                  label="Hours today"
                  value={data.techMetrics.hoursToday}
                  icon={Clock}
                  accent="bg-cyan-50 text-cyan-600"
                />
              </>
            )}
          </>
        )}

        {isAdmin && (
          <StatCard
            label="Total tickets"
            value={stats.totalTickets}
            icon={Ticket}
            accent="bg-violet-50 text-violet-600"
          />
        )}

        <StatCard
          label="Open tickets"
          value={stats.openTickets}
          icon={AlertCircle}
          accent="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Resolved"
          value={stats.resolvedTickets}
          icon={CheckCircle2}
          accent="bg-emerald-50 text-emerald-600"
        />

        {isStaff && user.role !== 'technician' && (
          <StatCard
            label="Active activities"
            value={stats.activeActivities}
            icon={Clock}
            accent="bg-cyan-50 text-cyan-600"
          />
        )}

        {isAdmin && (
          <>
            <StatCard
              label="Total revenue"
              value={formatCurrency(stats.totalRevenue)}
              subtext={`${stats.totalInvoices} invoices`}
              icon={DollarSign}
              accent="bg-green-50 text-green-600"
            />
            <StatCard
              label="Pending payments"
              value={formatCurrency(stats.pendingPayments)}
              subtext={stats.overdueInvoices > 0 ? `${stats.overdueInvoices} overdue` : undefined}
              icon={CreditCard}
              accent="bg-rose-50 text-rose-600"
            />
          </>
        )}

        {user.role === 'client' && data.clientProfile && (
          <>
            <StatCard
              label="Invoices"
              value={data.clientProfile.invoiceCount}
              icon={DollarSign}
              accent="bg-green-50 text-green-600"
            />
            <StatCard
              label="Pending invoices"
              value={data.clientProfile.pendingInvoices}
              icon={CreditCard}
              accent="bg-rose-50 text-rose-600"
            />
          </>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-3 xl:items-stretch">
        <div className="xl:col-span-2">
          <RecentTicketsTable tickets={data.recentTickets} />
        </div>
        <div className="flex h-full min-h-0 flex-col gap-4">
          <TicketBreakdown breakdown={data.ticketBreakdown} compact fill />
          {isAdmin && <SystemHealthCard health={data.systemHealth} compact className="shrink-0" />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        <RecentNoticesCard />
        {isStaff && data.recentActivity.length > 0 && (
          <RecentActivityFeed activities={data.recentActivity} />
        )}
        {isStaff && data.security && <SecurityStatusCard security={data.security} />}
        {user.role === 'client' && data.clientProfile && (
          <>
            <ClientServiceCard profile={data.clientProfile} />
            <ClientLicenseStatusCard />
          </>
        )}
      </div>
    </div>
  );
}
