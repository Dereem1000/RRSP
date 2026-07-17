'use client';

import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Loader2,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import type {
  GroupedManagementClient,
  ManagementSystemOverview,
  ManagementSystemsOverviewData,
} from '@/lib/management-systems-shared';
import { buildGroupedManagementClients } from '@/lib/management-systems-shared';
import {
  LicenseSerialUnlockPanel,
  useLicenseSerialReveal,
} from '@/components/licenses/LicenseSerialUnlockPanel';
import type { ActivationFeature } from '@/lib/license-constants';

export const ALL_CLIENTS_VIEW = '__all_clients__' as const;
export type ManagementSystemsView = ActivationFeature | typeof ALL_CLIENTS_VIEW;

function statusBadge(status: string) {
  switch (status) {
    case 'Active':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20';
    case 'Pending':
      return 'bg-amber-50 text-amber-800 ring-amber-600/20';
    case 'Expired':
      return 'bg-orange-50 text-orange-800 ring-orange-600/20';
    case 'Unavailable':
      return 'bg-red-50 text-red-700 ring-red-600/20';
    default:
      return 'bg-slate-100 text-slate-600 ring-slate-500/10';
  }
}

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-TT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return value;
  }
}

function displaySerial(
  serial: string | null | undefined,
  revealed: boolean,
  licensed = false
) {
  if (revealed && serial) return serial;
  if (!revealed && licensed) return 'Hidden';
  return serial ?? '—';
}

function SystemCard({
  system,
  selected,
  onSelect,
}: {
  system: ManagementSystemOverview;
  selected: boolean;
  onSelect: () => void;
}) {
  const activationRate =
    system.totalClients > 0 ? Math.round((system.activated / system.totalClients) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-5 text-left transition ${
        selected
          ? 'border-indigo-300 bg-indigo-50/50 ring-2 ring-indigo-500/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {system.productCode}
          </p>
          <h3 className="mt-1 font-semibold text-slate-900">{system.title}</h3>
        </div>
        <ChevronRight className={`h-5 w-5 shrink-0 ${selected ? 'text-indigo-500' : 'text-slate-300'}`} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs text-slate-500">{system.description}</p>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-lg bg-emerald-50 px-2 py-2">
          <p className="text-lg font-bold text-emerald-700">{system.activated}</p>
          <p className="text-[10px] font-medium uppercase text-emerald-600">Active</p>
        </div>
        <div className="rounded-lg bg-amber-50 px-2 py-2">
          <p className="text-lg font-bold text-amber-700">{system.pending}</p>
          <p className="text-[10px] font-medium uppercase text-amber-600">Pending</p>
        </div>
        <div className="rounded-lg bg-orange-50 px-2 py-2">
          <p className="text-lg font-bold text-orange-700">{system.expired}</p>
          <p className="text-[10px] font-medium uppercase text-orange-600">Expired</p>
        </div>
        <div className="rounded-lg bg-slate-100 px-2 py-2">
          <p className="text-lg font-bold text-slate-700">{system.totalClients}</p>
          <p className="text-[10px] font-medium uppercase text-slate-500">Clients</p>
        </div>
      </div>
      <div className="mt-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Activation rate</span>
          <span className="font-medium text-slate-700">{activationRate}%</span>
        </div>
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${activationRate}%` }}
          />
        </div>
      </div>
    </button>
  );
}

function ClientTable({
  system,
  scrollable = false,
  serialsRevealed = false,
}: {
  system: ManagementSystemOverview;
  scrollable?: boolean;
  serialsRevealed?: boolean;
}) {
  if (system.clients.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        No clients have <span className="font-medium text-slate-700">{system.title}</span> enabled yet.
        Enable it on a client record under Activation features, then sync licenses.
      </p>
    );
  }

  const table = (
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      <thead className={`bg-slate-50 ${scrollable ? 'sticky top-0 z-10 shadow-sm' : ''}`}>
        <tr>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Client
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Plan
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            License
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Serial
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Expires
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {system.clients.map((row) => (
          <tr key={row.clientId} className="hover:bg-slate-50/80">
            <td className="px-4 py-3">
              <Link
                href={`/clients/${row.clientId}`}
                className="font-medium text-indigo-600 hover:underline"
              >
                {row.clientName}
              </Link>
              {row.clientStatus && row.clientStatus !== 'active' && (
                <p className="text-xs capitalize text-slate-400">{row.clientStatus}</p>
              )}
            </td>
            <td className="px-4 py-3 capitalize text-slate-600">{row.serviceLevel ?? '—'}</td>
            <td className="px-4 py-3">
              <span
                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge(row.licenseStatus)}`}
              >
                {row.licenseStatus}
              </span>
              {row.licenseType && (
                <p className="mt-0.5 text-xs text-slate-400">{row.licenseType}</p>
              )}
            </td>
            <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-slate-600">
              {displaySerial(
                row.serialNumber,
                serialsRevealed,
                row.licenseStatus !== 'Not synced'
              )}
            </td>
            <td className="px-4 py-3 text-slate-600">{formatDate(row.expirationDate)}</td>
            <td className="px-4 py-3 text-right">
              <Link
                href={`/clients/${row.clientId}/licenses`}
                className="text-xs font-medium text-indigo-600 hover:underline"
              >
                Licenses
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  if (scrollable) {
    return (
      <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-200">
        {table}
      </div>
    );
  }

  return <div className="overflow-x-auto rounded-xl border border-slate-200">{table}</div>;
}

function systemSummaryBadges(systems: GroupedManagementClient['systems']) {
  const active = systems.filter((s) => s.licenseStatus === 'Active').length;
  const pending = systems.filter((s) => s.licenseStatus === 'Pending').length;
  const expired = systems.filter((s) => s.licenseStatus === 'Expired').length;
  const other = systems.length - active - pending - expired;
  return { active, pending, expired, other };
}

function GroupedClientTable({
  clients,
  scrollable = false,
  serialsRevealed = false,
}: {
  clients: GroupedManagementClient[];
  scrollable?: boolean;
  serialsRevealed?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (clientId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  if (clients.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
        No clients have activation features enabled yet.
      </p>
    );
  }

  const table = (
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      <thead className={`bg-slate-50 ${scrollable ? 'sticky top-0 z-10 shadow-sm' : ''}`}>
        <tr>
          <th className="w-10 px-2 py-3" aria-label="Expand" />
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Client
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Systems
          </th>
          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            Summary
          </th>
          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {clients.map((client) => {
          const multi = client.systems.length > 1;
          const isOpen = expanded.has(client.clientId);
          const summary = systemSummaryBadges(client.systems);

          return (
            <Fragment key={client.clientId}>
              <tr
                className={`${multi ? 'cursor-pointer hover:bg-slate-50/80' : 'hover:bg-slate-50/80'}`}
                onClick={multi ? () => toggle(client.clientId) : undefined}
              >
                <td className="px-2 py-3 text-center text-slate-400">
                  {multi ? (
                    isOpen ? (
                      <ChevronDown className="mx-auto h-4 w-4" />
                    ) : (
                      <ChevronRight className="mx-auto h-4 w-4" />
                    )
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/clients/${client.clientId}`}
                    className="font-medium text-indigo-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {client.clientName}
                  </Link>
                  {client.clientStatus && client.clientStatus !== 'active' && (
                    <p className="text-xs capitalize text-slate-400">{client.clientStatus}</p>
                  )}
                  <p className="mt-0.5 text-xs capitalize text-slate-500">
                    {client.serviceLevel ?? '—'} plan
                  </p>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {multi ? (
                    <span className="font-medium">{client.systems.length} systems</span>
                  ) : (
                    <span>{client.systems[0]?.title ?? '—'}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {multi ? (
                    <div className="flex flex-wrap gap-1.5">
                      {summary.active > 0 && (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                          {summary.active} active
                        </span>
                      )}
                      {summary.pending > 0 && (
                        <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">
                          {summary.pending} pending
                        </span>
                      )}
                      {summary.expired > 0 && (
                        <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-inset ring-orange-600/20">
                          {summary.expired} expired
                        </span>
                      )}
                      {summary.other > 0 && (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                          {summary.other} other
                        </span>
                      )}
                    </div>
                  ) : (
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge(client.systems[0]?.licenseStatus ?? 'Not synced')}`}
                      >
                        {client.systems[0]?.licenseStatus ?? 'Not synced'}
                      </span>
                      {client.systems[0]?.licenseType && (
                        <p className="mt-0.5 text-xs text-slate-400">{client.systems[0].licenseType}</p>
                      )}
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {displaySerial(
                          client.systems[0]?.serialNumber,
                          serialsRevealed,
                          client.systems[0]?.licenseStatus !== 'Not synced'
                        )}
                      </p>
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/clients/${client.clientId}/licenses`}
                    className="text-xs font-medium text-indigo-600 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Licenses
                  </Link>
                </td>
              </tr>
              {multi &&
                isOpen &&
                client.systems.map((system) => (
                  <tr
                    key={`${client.clientId}-${system.feature}`}
                    className="bg-slate-50/60"
                  >
                    <td />
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {system.productCode}
                      </p>
                      <p className="font-medium text-slate-800">{system.title}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${statusBadge(system.licenseStatus)}`}
                      >
                        {system.licenseStatus}
                      </span>
                      {system.licenseType && (
                        <p className="mt-0.5 text-xs text-slate-400">{system.licenseType}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <p className="font-mono text-xs text-slate-600">
                        {displaySerial(
                          system.serialNumber,
                          serialsRevealed,
                          system.licenseStatus !== 'Not synced'
                        )}
                      </p>
                      <p className="text-xs text-slate-500">
                        Expires {formatDate(system.expirationDate)}
                      </p>
                    </td>
                  </tr>
                ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  if (scrollable) {
    return (
      <div className="overflow-x-auto overflow-y-auto rounded-xl border border-slate-200">
        {table}
      </div>
    );
  }

  return <div className="overflow-x-auto rounded-xl border border-slate-200">{table}</div>;
}

function AllClientsCard({
  clientCount,
  selected,
  onSelect,
}: {
  clientCount: number;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-2xl border p-5 text-left transition ${
        selected
          ? 'border-indigo-300 bg-indigo-50/50 ring-2 ring-indigo-500/20'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Overview</p>
          <h3 className="mt-1 font-semibold text-slate-900">All clients</h3>
        </div>
        <Users className={`h-5 w-5 shrink-0 ${selected ? 'text-indigo-500' : 'text-slate-300'}`} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        One row per client. Expand to see each management system and license.
      </p>
      <p className="mt-4 text-2xl font-bold text-slate-800">{clientCount}</p>
      <p className="text-[10px] font-medium uppercase text-slate-500">Clients with systems</p>
    </button>
  );
}

export function ManagementSystemsClient() {
  const [data, setData] = useState<ManagementSystemsOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedFeature, setSelectedFeature] = useState<ManagementSystemsView | null>(null);
  const serialReveal = useLicenseSerialReveal();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/msp/management-systems', {
        headers: serialReveal.authHeaders(),
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to load management systems');
      setData(json.overview);
      serialReveal.applyRevealResponse(json.serialsRevealed);
      setSelectedFeature((prev) => {
        if (prev === ALL_CLIENTS_VIEW) return ALL_CLIENTS_VIEW;
        if (prev && json.overview.systems.some((s: ManagementSystemOverview) => s.feature === prev)) {
          return prev;
        }
        return ALL_CLIENTS_VIEW;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load management systems');
    } finally {
      setLoading(false);
    }
  }, [serialReveal.authHeaders, serialReveal.applyRevealResponse]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUnlock(password: string) {
    const ok = await serialReveal.unlock(password);
    if (ok) await load();
  }

  async function handleLock() {
    await serialReveal.lock();
    await load();
  }

  const selectedSystem = useMemo(
    () =>
      selectedFeature && selectedFeature !== ALL_CLIENTS_VIEW
        ? data?.systems.find((s) => s.feature === selectedFeature) ?? null
        : null,
    [data, selectedFeature]
  );

  const groupedClients = useMemo(
    () => (data ? buildGroupedManagementClients(data.systems) : []),
    [data]
  );

  if (loading && !data) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading management systems…
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

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/msp"
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-indigo-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            MSP management
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Management systems</h1>
          <p className="mt-1 text-sm text-slate-500">
            Activation status across POS, restaurant, CRM, and other licensed products
          </p>
        </div>
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

      {!data.dbAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          License database not connected. Set <code className="rounded bg-amber-100 px-1">LICENSE_DB_PATH</code>{' '}
          in your .env to see activation details.
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <StatCard
          label="Licensed products"
          value={data.totals.systems}
          icon={Boxes}
          accent="bg-indigo-50 text-indigo-600"
        />
        <StatCard
          label="Clients with systems"
          value={data.totals.clientsWithAnySystem}
          icon={CheckCircle2}
          accent="bg-blue-50 text-blue-600"
        />
        <StatCard
          label="Active activations"
          value={data.totals.activatedLicenses}
          subtext="Across all products"
          icon={CheckCircle2}
          accent="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Pending activation"
          value={data.totals.pendingLicenses}
          subtext="Issued but not active"
          icon={Clock}
          accent="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Expired licenses"
          value={data.totals.expiredLicenses}
          subtext="Past expiration date"
          icon={XCircle}
          accent="bg-orange-50 text-orange-600"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,340px)_1fr] xl:items-start">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Views</h2>
          <AllClientsCard
            clientCount={data.totals.clientsWithAnySystem}
            selected={selectedFeature === ALL_CLIENTS_VIEW}
            onSelect={() => setSelectedFeature(ALL_CLIENTS_VIEW)}
          />
          <h2 className="pt-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Products</h2>
          {data.systems.map((system) => (
            <SystemCard
              key={system.feature}
              system={system}
              selected={selectedFeature === system.feature}
              onSelect={() => setSelectedFeature(system.feature)}
            />
          ))}
        </section>

        <section
          className="msp-systems-detail-panel xl:sticky xl:top-[5.25rem] xl:z-10 xl:max-h-[calc(100dvh-5.25rem-2rem)] xl:self-start"
          aria-label={
            selectedFeature === ALL_CLIENTS_VIEW
              ? 'All client activations'
              : selectedSystem
                ? `${selectedSystem.title} activations`
                : 'Product activations'
          }
        >
          <div className="flex max-h-[calc(100dvh-5.25rem-2rem)] flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <LicenseSerialUnlockPanel
            revealed={serialReveal.revealed}
            unlocking={serialReveal.unlocking}
            error={serialReveal.error}
            onUnlock={handleUnlock}
            onLock={handleLock}
            compact
          />
          {selectedFeature === ALL_CLIENTS_VIEW ? (
            <>
              <div className="shrink-0 border-b border-slate-100 pb-4">
                <h2 className="text-lg font-semibold text-slate-900">All clients</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Clients with multiple systems can be expanded to view each product license.
                </p>
              </div>
              <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <GroupedClientTable
                  clients={groupedClients}
                  scrollable
                  serialsRevealed={serialReveal.revealed}
                />
              </div>
            </>
          ) : selectedSystem ? (
            <>
              <div className="shrink-0 border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                    {selectedSystem.productCode}
                  </p>
                  <h2 className="text-lg font-semibold text-slate-900">{selectedSystem.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{selectedSystem.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {selectedSystem.activated} active
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-800">
                    <Clock className="h-3.5 w-3.5" />
                    {selectedSystem.pending} pending
                  </span>
                  {selectedSystem.expired > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 font-medium text-orange-800">
                      <XCircle className="h-3.5 w-3.5" />
                      {selectedSystem.expired} expired
                    </span>
                  )}
                  {selectedSystem.notSynced > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                      <XCircle className="h-3.5 w-3.5" />
                      {selectedSystem.notSynced} not synced
                    </span>
                  )}
                </div>
                </div>
              </div>
              <div className="mt-5 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <ClientTable
                  system={selectedSystem}
                  scrollable
                  serialsRevealed={serialReveal.revealed}
                />
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-500">Select a product to view client activations.</p>
          )}
          </div>
        </section>
      </div>
    </div>
  );
}
