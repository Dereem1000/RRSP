'use client';



import { useState } from 'react';

import { Loader2, RotateCcw, Plus } from 'lucide-react';

import type { UsageInfo } from '@/lib/client-constants';

import { USAGE_TYPES, getPlanForLevel, getUsageMetricsForLevel } from '@/lib/client-constants';



const labels: Record<(typeof USAGE_TYPES)[number], string> = {

  onsiteVisits: 'Onsite visits',

  supportTickets: 'Support tickets',

  endpoints: 'Endpoints',

  supportHours: 'Support hours',

};



export function ClientUsagePanel({

  clientId,

  initialUsage,

  serviceLevel,

  isAdmin,

}: {

  clientId: string;

  initialUsage: UsageInfo;

  serviceLevel?: string | null;

  isAdmin: boolean;

}) {

  const [usage, setUsage] = useState(initialUsage);

  const [loading, setLoading] = useState('');

  const [error, setError] = useState('');



  const plan = getPlanForLevel(serviceLevel);

  const visibleMetrics = getUsageMetricsForLevel(serviceLevel);



  async function increment(type: (typeof USAGE_TYPES)[number]) {

    setLoading(type);

    setError('');

    try {

      const res = await fetch(`/api/clients/${clientId}/usage/increment`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ type, amount: 1 }),

      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to increment');

      setUsage(data.usage);

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Failed to increment');

    } finally {

      setLoading('');

    }

  }



  async function resetUsage(type: (typeof USAGE_TYPES)[number] | 'all' = 'all') {

    if (!confirm(type === 'all' ? 'Reset all usage counters?' : `Reset ${labels[type as (typeof USAGE_TYPES)[number]]}?`)) return;

    setLoading('reset');

    setError('');

    try {

      const res = await fetch(`/api/clients/${clientId}/usage/reset`, {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        body: JSON.stringify({ type }),

      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || 'Failed to reset');

      setUsage(data.usage);

    } catch (err) {

      setError(err instanceof Error ? err.message : 'Failed to reset');

    } finally {

      setLoading('');

    }

  }



  const rows = visibleMetrics.map((type) => ({

    type,

    label: labels[type],

    data: usage[type],

  }));



  if (!serviceLevel || serviceLevel === 'per-job') {

    return (

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <h2 className="font-semibold text-slate-900">Usage tracking</h2>

        <p className="mt-3 text-sm text-slate-500">

          {serviceLevel === 'per-job'

            ? 'Per-job clients are billed per ticket — no plan usage limits apply.'

            : 'Assign a service plan to enable usage tracking.'}

        </p>

      </section>

    );

  }



  return (

    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <div className="flex flex-wrap items-center justify-between gap-3">

        <div>

          <h2 className="font-semibold text-slate-900">Usage tracking</h2>

          {plan && <p className="text-xs text-slate-500">{plan.name}</p>}

        </div>

        {isAdmin && rows.length > 0 && (

          <button

            type="button"

            onClick={() => resetUsage('all')}

            disabled={loading === 'reset'}

            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"

          >

            {loading === 'reset' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}

            Reset all

          </button>

        )}

      </div>



      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}



      <div className="mt-4 space-y-4">

        {rows.length === 0 ? (

          <p className="text-sm text-slate-400">No usage metrics for this plan.</p>

        ) : (

          rows.map(({ type, label, data }) => (

            <div key={type}>

              <div className="mb-1 flex items-center justify-between text-sm">

                <span className="font-medium text-slate-700">{label}</span>

                <span className="text-slate-500">

                  {data.used} / {data.limit || '∞'} ({data.percentage}%)

                </span>

              </div>

              <div className="h-2 overflow-hidden rounded-full bg-slate-100">

                <div

                  className={`h-full rounded-full transition-all ${

                    data.percentage >= 100 ? 'bg-red-500' : data.percentage >= 80 ? 'bg-amber-500' : 'bg-indigo-500'

                  }`}

                  style={{ width: `${Math.min(data.percentage, 100)}%` }}

                />

              </div>

              {isAdmin && (

                <button

                  type="button"

                  onClick={() => increment(type)}

                  disabled={loading === type}

                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-60"

                >

                  {loading === type ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}

                  Increment

                </button>

              )}

            </div>

          ))

        )}

      </div>



      {usage.lastResetDate && (

        <p className="mt-4 text-xs text-slate-400">Last reset: {usage.lastResetDate}</p>

      )}

    </section>

  );

}

