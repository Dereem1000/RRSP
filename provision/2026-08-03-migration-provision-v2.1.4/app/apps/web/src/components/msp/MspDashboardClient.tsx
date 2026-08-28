'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  DollarSign,
  Loader2,
  RefreshCw,
  Shield,
  TrendingUp,
  Users,
  Boxes,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { SERVICE_PLANS } from '@/lib/client-constants';
import type { MspDashboardData } from '@/lib/msp-dashboard';

function formatCurrency(amount: number): string {
  return `TTD ${amount.toLocaleString('en-TT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function MspDashboardClient() {
  const [data, setData] = useState<MspDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/msp/overview');
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load MSP overview');
      setData(json.dashboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load MSP overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading MSP dashboard…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
        <button type="button" onClick={load} className="ml-3 font-semibold underline">
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { license } = data;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">MSP management</h1>
          <p className="mt-1 text-sm text-slate-500">
            Revenue, service plans, usage alerts, and license activation overview
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/msp/systems"
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
          >
            <Boxes className="h-4 w-4" />
            Management systems
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Monthly recurring revenue"
          value={formatCurrency(data.mrr)}
          subtext={`${data.activeSubscriptions} active subscriptions`}
          icon={DollarSign}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Active MSP clients"
          value={data.activeClients}
          subtext={`${data.totalMspClients} total · ${data.newClientsThisMonth} new this month`}
          icon={Building2}
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Avg revenue / client"
          value={formatCurrency(data.avgRevenuePerClient)}
          icon={TrendingUp}
          accent="bg-violet-50 text-violet-600"
        />
        <StatCard
          label="Usage alerts"
          value={data.usageAlertsCount}
          subtext="Clients at ≥80% of plan limits"
          icon={AlertTriangle}
          accent="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Service plans</h2>
          <p className="mt-1 text-xs text-slate-500">
            Popular: {SERVICE_PLANS[data.popularPlan as keyof typeof SERVICE_PLANS]?.name ?? data.popularPlan} ·
            Revenue leader: {SERVICE_PLANS[data.revenueLeader as keyof typeof SERVICE_PLANS]?.name ?? data.revenueLeader}
          </p>
          <div className="mt-4 space-y-3">
            {data.planStats.map((plan) => (
              <div
                key={plan.level}
                className="flex items-center justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{plan.name}</p>
                  <p className="text-xs text-slate-500">
                    {plan.clients} client{plan.clients !== 1 ? 's' : ''}
                    {plan.price != null ? ` · ${formatCurrency(plan.price)}/mo` : ''}
                  </p>
                </div>
                <p className="text-sm font-semibold text-slate-900">{formatCurrency(plan.revenue)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">License activation</h2>
          </div>
          {!license.dbAvailable ? (
            <p className="mt-4 text-sm text-amber-800">
              License database not found. Set <code className="rounded bg-amber-100 px-1">LICENSE_DB_PATH</code> in
              your .env file to connect the activation system.
            </p>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-2xl font-bold text-emerald-700">{license.withLicenses}</p>
                  <p className="text-xs text-emerald-600">Active</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-3">
                  <p className="text-2xl font-bold text-amber-700">{license.pendingActivation}</p>
                  <p className="text-xs text-amber-600">Pending</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3">
                  <p className="text-2xl font-bold text-slate-700">{license.withoutLicenses}</p>
                  <p className="text-xs text-slate-600">Not synced</p>
                </div>
              </div>
              {license.recentActivity.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {license.recentActivity.map((item) => (
                    <li key={item.clientId} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/clients/${item.clientId}`} className="font-medium text-indigo-600 hover:underline">
                        {item.clientName}
                      </Link>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === 'Active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : item.status === 'Partial' || item.status === 'Pending'
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Aggregate usage</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <UsageBar
              label="Onsite visits"
              used={data.onsiteUsage.used}
              limit={data.onsiteUsage.limit}
            />
            <UsageBar
              label="Support tickets"
              used={data.ticketUsage.used}
              limit={data.ticketUsage.limit}
            />
          </dl>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold text-slate-900">Usage alerts</h2>
            <Link href="/clients" className="text-xs font-medium text-indigo-600 hover:underline">
              View clients
            </Link>
          </div>
          {data.usageAlerts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No clients near plan limits.</p>
          ) : (
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto">
              {data.usageAlerts.map((alert, i) => (
                <li
                  key={`${alert.clientId}-${alert.metric}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-amber-100 bg-amber-50/50 px-4 py-2.5 text-sm"
                >
                  <div>
                    <Link href={`/clients/${alert.clientId}`} className="font-medium text-slate-800 hover:text-indigo-600">
                      {alert.clientName}
                    </Link>
                    <p className="text-xs text-slate-500 capitalize">
                      {alert.metric} · {alert.serviceLevel}
                    </p>
                  </div>
                  <span className="shrink-0 font-semibold text-amber-800">
                    {alert.used}/{alert.limit} ({alert.percentage}%)
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-slate-500" />
          <h2 className="font-semibold text-slate-900">Quick links</h2>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/msp/systems"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Management systems
          </Link>
          <Link
            href="/clients"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Manage clients
          </Link>
          <Link
            href="/tickets"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Support tickets
          </Link>
        </div>
      </section>
    </div>
  );
}

function UsageBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-1 text-sm font-semibold text-slate-800">
        {used} / {limit || '—'}
      </dd>
      {limit > 0 && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${pct >= 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
