'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil, Plus, Search, Target } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { CreateOpportunityModal } from './CreateOpportunityModal';
import { EditOpportunityModal } from './EditOpportunityModal';
import {
  ACTIVE_PIPELINE_STAGES,
  PRODUCT_LABELS,
  SALES_PRODUCTS,
  STAGE_COLORS,
  STAGE_LABELS,
} from '@/lib/sales-constants';
import type { ClientPickerOption } from '@/lib/client-picker';
import { useUrlTab } from '@/lib/use-url-tab';

const SALES_TABS = ['pipeline', 'won', 'lost'] as const;

export type OpportunityRow = {
  id: string;
  companyName: string;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  pitchNotes?: string | null;
  product: string;
  stage: string;
  dealType?: string | null;
  updated_at?: string;
};

type PipelineStats = {
  total: number;
  active: number;
  won: number;
  lost: number;
  byStage: Record<string, number>;
};

export function SalesPipelineClient({
  opportunities,
  stats,
  clients,
}: {
  opportunities: OpportunityRow[];
  stats: PipelineStats;
  clients: ClientPickerOption[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [systemFilter, setSystemFilter] = useState<'all' | (typeof SALES_PRODUCTS)[number]>('all');
  const [tab, setTab] = useUrlTab(SALES_TABS, 'pipeline');
  const [showCreate, setShowCreate] = useState(false);
  const [editOpp, setEditOpp] = useState<OpportunityRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return opportunities.filter((o) => {
      const matchesTab =
        tab === 'pipeline'
          ? ACTIVE_PIPELINE_STAGES.includes(o.stage as (typeof ACTIVE_PIPELINE_STAGES)[number])
          : tab === 'won'
            ? o.stage === 'won'
            : o.stage === 'lost';
      if (!matchesTab) return false;
      if (systemFilter !== 'all' && o.product !== systemFilter) return false;
      if (!q) return true;
      return (
        o.companyName.toLowerCase().includes(q) ||
        o.contactName.toLowerCase().includes(q) ||
        (o.email ?? '').toLowerCase().includes(q) ||
        PRODUCT_LABELS[o.product as keyof typeof PRODUCT_LABELS]?.toLowerCase().includes(q)
      );
    });
  }, [opportunities, search, systemFilter, tab]);

  const byStage = useMemo(() => {
    const map: Record<string, OpportunityRow[]> = {};
    for (const stage of ACTIVE_PIPELINE_STAGES) map[stage] = [];
    for (const opp of filtered) {
      if (map[opp.stage]) map[opp.stage].push(opp);
    }
    for (const stage of ACTIVE_PIPELINE_STAGES) {
      map[stage].sort((a, b) => {
        const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return bTime - aTime;
      });
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sales</h1>
          <p className="mt-1 text-sm text-slate-500">
            Guided pipeline for selling your software systems — prospects stay here until won
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus className="h-4 w-4" />
          New opportunity
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Active pipeline" value={stats.active} icon={Target} accent="bg-indigo-50 text-indigo-600" />
        <StatCard label="Won" value={stats.won} icon={Target} accent="bg-emerald-50 text-emerald-600" />
        <StatCard label="Lost" value={stats.lost} icon={Target} accent="bg-red-50 text-red-600" />
        <StatCard label="Total tracked" value={stats.total} icon={Target} accent="bg-slate-100 text-slate-600" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ['pipeline', 'Pipeline'],
              ['won', 'Won'],
              ['lost', 'Lost'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                tab === key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:flex-1 sm:justify-end">
          <select
            value={systemFilter}
            onChange={(e) =>
              setSystemFilter(e.target.value as 'all' | (typeof SALES_PRODUCTS)[number])
            }
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            aria-label="Filter by system"
          >
            <option value="all">All systems</option>
            {SALES_PRODUCTS.map((p) => (
              <option key={p} value={p}>
                {PRODUCT_LABELS[p]}
              </option>
            ))}
          </select>

          <div className="relative min-w-[200px] max-w-sm flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opportunities…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>
        </div>
      </div>

      {tab === 'pipeline' ? (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ACTIVE_PIPELINE_STAGES.map((stage) => (
            <div key={stage} className="min-w-[240px] flex-1 shrink-0">
              <div className="mb-2 flex items-center justify-between px-1">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {STAGE_LABELS[stage]}
                </h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                  {byStage[stage]?.length ?? 0}
                </span>
              </div>
              <div className="min-h-[200px] space-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/50 p-2">
                {(byStage[stage] ?? []).map((opp) => (
                  <div
                    key={opp.id}
                    className="rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-300 hover:shadow-md"
                  >
                    <div className="flex items-start gap-1 p-3">
                      <Link href={`/sales/${opp.id}`} className="min-w-0 flex-1">
                        <p className="font-medium text-slate-900">{opp.companyName}</p>
                        <p className="text-xs text-slate-500">{opp.contactName}</p>
                        <p className="mt-2 text-[11px] font-medium text-indigo-700">
                          {PRODUCT_LABELS[opp.product as keyof typeof PRODUCT_LABELS]}
                        </p>
                      </Link>
                      <button
                        type="button"
                        onClick={() => setEditOpp(opp)}
                        className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-indigo-600"
                        title="Edit prospect"
                        aria-label={`Edit ${opp.companyName}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
                {(byStage[stage] ?? []).length === 0 && (
                  <p className="px-2 py-6 text-center text-xs text-slate-400">No deals here</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/80">
                <th className="px-4 py-3 font-medium text-slate-600">Business</th>
                <th className="px-4 py-3 font-medium text-slate-600">Product</th>
                <th className="px-4 py-3 font-medium text-slate-600">Stage</th>
                <th className="px-4 py-3 font-medium text-slate-600">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((opp) => (
                <tr key={opp.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3">
                    <Link href={`/sales/${opp.id}`} className="font-medium text-indigo-700 hover:underline">
                      {opp.companyName}
                    </Link>
                    <p className="text-xs text-slate-500">{opp.contactName}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {PRODUCT_LABELS[opp.product as keyof typeof PRODUCT_LABELS]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                        STAGE_COLORS[opp.stage as keyof typeof STAGE_COLORS] ?? STAGE_COLORS.cold_prospect
                      }`}
                    >
                      {STAGE_LABELS[opp.stage as keyof typeof STAGE_LABELS]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {opp.updated_at ? new Date(opp.updated_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                    No opportunities in this view
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateOpportunityModal
          clients={clients}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            router.push(`/sales/${id}`);
          }}
        />
      )}

      {editOpp && (
        <EditOpportunityModal
          opportunity={{
            id: editOpp.id,
            companyName: editOpp.companyName,
            contactName: editOpp.contactName,
            email: editOpp.email,
            phone: editOpp.phone,
            address: editOpp.address,
            product: editOpp.product as import('@cd-v2/database').SalesProduct,
            pitchNotes: editOpp.pitchNotes,
          }}
          onClose={() => setEditOpp(null)}
          onSaved={() => {
            setEditOpp(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
