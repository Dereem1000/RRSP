'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  BookOpen,
  Brain,
  LayoutDashboard,
  Loader2,
  MessageSquare,
  RefreshCw,
  ScrollText,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { MiniSystemLogsTab } from '@/components/mini/MiniSystemLogsTab';
import { MiniLibraryTab } from '@/components/mini/MiniLibraryTab';
import {
  companionBubbleClass,
  companionKindBadgeClass,
  companionKindLabel,
  type MiniChatEntry,
  type MiniGrowthPayload,
} from '@/lib/mini-companion-ui';

type MiniTab = 'overview' | 'system-logs' | 'library';

type MiniLlmUsage = {
  status?: string;
  label?: string;
  available?: boolean;
  rate_limited?: boolean;
  window_calls?: number;
  max_calls_per_window?: number;
  remaining_calls?: number;
  successes?: number;
  failures?: number;
  executions?: number;
  last_error?: string | null;
  provider?: string | null;
  model?: string | null;
};

type MiniDashboardPayload = {
  state?: {
    name?: string;
    state?: { integrity?: number; capability?: number; focus?: number; cycles?: number };
    brain_backend?: string;
  };
  activity?: {
    status?: string;
    summary?: string;
    current_goal?: string;
    provider_label?: string;
    pending_goals?: number;
    pending_approvals?: number;
    llm_usage?: MiniLlmUsage;
    auto_evolution?: {
      interval_cycles?: number;
      next_cycle?: number;
      latest_status?: string;
      latest_subsystem?: string | null;
    };
  };
  evolution?: {
    summary?: {
      inspections?: number;
      proposals?: number;
      valid_proposals?: number;
      applied?: number;
      latest_subsystem?: string | null;
      latest_status?: string | null;
    };
  };
  roadmap?: {
    completion?: { percent?: number; systems_percent?: number };
    mini_systems?: Array<{ name: string; status: string; detail: string }>;
    notifications?: Array<{ level: string; title: string; message: string }>;
    readiness?: { percent?: number; gates?: Array<{ name: string; status: string; detail: string }> };
  };
  chat_history?: MiniChatEntry[];
  system_notifications?: Array<{ source?: string; level?: string; title: string; message: string }>;
  growth?: MiniGrowthPayload;
  hydration?: { loading?: boolean; last_error?: string | null };
};

function toneClass(status: string): string {
  const key = status.toLowerCase();
  if (key.includes('active') || key.includes('built') || key === 'ready') return 'bg-emerald-100 text-emerald-800';
  if (key.includes('attention') || key.includes('partial') || key.includes('warn')) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function llmUsageTone(status: string | undefined): string {
  switch (status) {
    case 'available':
    case 'low':
      return 'bg-emerald-100 text-emerald-700';
    case 'cooldown':
    case 'heuristic_only':
      return 'bg-sky-100 text-sky-700';
    case 'budget_exhausted':
    case 'rate_limited':
    case 'unconfigured':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-slate-100 text-slate-700';
  }
}

function llmUsageHeadline(usage: MiniLlmUsage | undefined): string {
  if (!usage) return 'Unknown';
  if (usage.status === 'available' || usage.status === 'low') {
    return `${usage.remaining_calls ?? 0}/${usage.max_calls_per_window ?? 0}`;
  }
  if (usage.status === 'budget_exhausted') return 'Exhausted';
  if (usage.status === 'rate_limited') return 'Rate limited';
  if (usage.status === 'cooldown') return 'Cooldown';
  if (usage.status === 'heuristic_only') return 'Heuristic';
  if (usage.status === 'unconfigured') return 'No LLM';
  return usage.label || 'Unknown';
}

export function MiniDashboardClient() {
  const [tab, setTab] = useState<MiniTab>('overview');
  const [payload, setPayload] = useState<MiniDashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/mini/dashboard', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Mini dashboard');
      setPayload(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Mini dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'overview') return;
    load();
    const id = window.setInterval(load, 15000);
    return () => window.clearInterval(id);
  }, [load, tab]);

  const core = payload?.state?.state;
  const activity = payload?.activity;
  const llmUsage = activity?.llm_usage;
  const evolution = payload?.evolution?.summary;
  const autoEvolution = activity?.auto_evolution;
  const notifications = useMemo(
    () => [
      ...(payload?.system_notifications || []),
      ...(payload?.roadmap?.notifications || []).map((item) => ({
        source: 'mini',
        level: item.level,
        title: item.title,
        message: item.message,
      })),
    ],
    [payload]
  );

  const growth = payload?.growth;
  const chatFeedItems = useMemo(() => {
    return (payload?.chat_history || [])
      .map((entry, index) => ({
        role: entry.role,
        content: entry.content,
        created_at: entry.created_at,
        kind: entry.kind,
        read: entry.read,
        key: `chat-${entry.fingerprint || index}-${entry.role}`,
        sortTime: entry.created_at ? Date.parse(entry.created_at) : index,
      }))
      .sort((left, right) => {
        const leftTime = Number.isFinite(left.sortTime) ? left.sortTime : 0;
        const rightTime = Number.isFinite(right.sortTime) ? right.sortTime : 0;
        return rightTime - leftTime;
      });
  }, [payload?.chat_history]);

  async function sendChat() {
    const message = chatInput.trim();
    if (!message || chatBusy) return;
    setChatBusy(true);
    setError('');
    try {
      const res = await fetch('/api/mini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chat failed');
      setChatInput('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setChatBusy(false);
    }
  }

  if (loading && !payload) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading Mini dashboard…
      </div>
    );
  }

  if (error && !payload) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-sky-700" />
            <h1 className="text-2xl font-bold text-slate-900">{payload?.state?.name || 'Mini'}</h1>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass(activity?.status || 'ready')}`}>
              {activity?.status || 'ready'}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {activity?.summary || 'Mini assistant dashboard — live data from your docked Mini instance.'}
          </p>
        </div>
        {tab === 'overview' && (
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              load().finally(() => setLoading(false));
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {(
          [
            ['overview', 'Overview', LayoutDashboard],
            ['library', 'Library', BookOpen],
            ['system-logs', 'System Logs', ScrollText],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? 'border-sky-600 text-sky-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === 'system-logs' ? (
        <MiniSystemLogsTab />
      ) : tab === 'library' ? (
        <MiniLibraryTab />
      ) : (
        <>
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Integrity" value={(core?.integrity ?? 0).toFixed(2)} icon={Activity} accent="bg-emerald-100 text-emerald-700" />
        <StatCard label="Capability" value={(core?.capability ?? 0).toFixed(2)} icon={Sparkles} accent="bg-violet-100 text-violet-700" />
        <StatCard label="Focus" value={(core?.focus ?? 0).toFixed(2)} icon={Brain} accent="bg-sky-100 text-sky-700" />
        <StatCard
          label="Completion"
          value={`${payload?.roadmap?.completion?.percent ?? 0}%`}
          subtext={`Brain: ${activity?.provider_label || payload?.state?.brain_backend || 'unknown'}`}
          icon={Bot}
          accent="bg-indigo-100 text-indigo-700"
        />
        <StatCard
          label="LLM usage"
          value={llmUsageHeadline(llmUsage)}
          subtext={
            llmUsage?.label ||
            (llmUsage?.executions
              ? `${llmUsage.successes ?? 0} ok / ${llmUsage.failures ?? 0} failed`
              : 'Restart Mini dashboard for live LLM budget')
          }
          icon={Zap}
          accent={llmUsageTone(llmUsage?.status)}
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-violet-700" />
          <h2 className="text-lg font-semibold text-slate-900">Growth</h2>
          {growth?.maturity ? (
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${toneClass(growth.maturity)}`}>
              {growth.maturity.replace(/-/g, ' ')}
            </span>
          ) : null}
        </div>
        <p className="mb-4 text-sm text-slate-600">
          {growth?.narrative ||
            'Integrity, capability, and focus cap early — memories, skills, notes, and companion messages show real change.'}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ['Memories', 'memories'],
              ['Skills', 'skills'],
              ['Lessons', 'lessons'],
              ['Notes', 'notes'],
            ] as const
          ).map(([label, key]) => {
            const total = growth?.totals?.[key] ?? 0;
            const delta = growth?.deltas?.[key] ?? 0;
            return (
              <div key={key} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{total.toLocaleString()}</p>
                {delta > 0 ? (
                  <p className="mt-1 text-xs font-medium text-emerald-700">+{delta.toLocaleString()} since baseline</p>
                ) : (
                  <p className="mt-1 text-xs text-slate-500">Live count from Mini runtime</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-semibold text-slate-900">Evolution signals</h2>
        </div>
        <p className="mb-4 text-sm text-slate-600">
          Integrity, capability, and completion cap at their max — use these uncapped signals to see whether Mini is still changing.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Cycles</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{core?.cycles ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">Total autonomous cycles completed</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Evolution loop</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {autoEvolution?.latest_subsystem
                ? `${autoEvolution.latest_subsystem} · ${autoEvolution.latest_status || 'idle'}`
                : autoEvolution?.latest_status || 'idle'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Next auto-evolution near cycle {autoEvolution?.next_cycle ?? '—'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Proposals</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{evolution?.proposals ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">
              {evolution?.valid_proposals ?? 0} valid · {evolution?.applied ?? 0} applied
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Inspections</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{evolution?.inspections ?? 0}</p>
            <p className="mt-1 text-xs text-slate-500">
              Current goal: {activity?.current_goal || 'None queued'}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-fuchsia-700" />
            <h2 className="text-lg font-semibold text-slate-900">Companion</h2>
          </div>
          <p className="mb-3 text-sm text-slate-600">
            Thoughts, requests, and assistance from Mini while she runs — pushed live from the docked instance.
          </p>
          <div className="max-h-[28rem] space-y-3 overflow-y-auto rounded-xl bg-slate-50 p-4">
            {chatFeedItems.length === 0 ? (
              <p className="text-sm text-slate-500">
                No companion messages yet. Keep Mini&apos;s forever loop running and she&apos;ll speak here.
              </p>
            ) : (
              chatFeedItems.map((entry) => (
                <div
                  key={entry.key}
                  className={`rounded-xl px-3 py-2 text-sm ${companionBubbleClass(entry.role, entry.kind)} ${
                    entry.read ? 'opacity-80' : ''
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                      {entry.role === 'companion' ? companionKindLabel(entry.kind) : entry.role}
                    </p>
                    {entry.role === 'companion' && entry.kind ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${companionKindBadgeClass(entry.kind)}`}
                      >
                        {entry.kind}
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap">{entry.content}</p>
                </div>
              ))
            )}
          </div>
          <div className="mt-4 flex gap-2">
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              rows={3}
              placeholder="Ask Mini what changed, what needs attention, or what connected systems report…"
              className="min-h-[4.5rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
            />
            <button
              type="button"
              onClick={sendChat}
              disabled={chatBusy || !chatInput.trim()}
              className="self-end rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
            >
              {chatBusy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-semibold text-slate-900">Alerts</h2>
            </div>
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <p className="text-sm text-slate-500">No active alerts.</p>
              ) : (
                notifications.slice(0, 8).map((notice, index) => (
                  <div key={`${notice.title}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{notice.title}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${toneClass(notice.level || 'info')}`}>
                        {notice.level || 'info'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">{notice.message}</p>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Mini systems</h2>
            <div className="mt-3 space-y-2">
              {(payload?.roadmap?.mini_systems || []).slice(0, 6).map((system) => (
                <div key={system.name} className="rounded-xl border border-slate-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">{system.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${toneClass(system.status)}`}>
                      {system.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{system.detail}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Readiness gates</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(payload?.roadmap?.readiness?.gates || []).map((gate) => (
            <div key={gate.name} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-slate-900">{gate.name}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${toneClass(gate.status)}`}>
                  {gate.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{gate.detail}</p>
            </div>
          ))}
        </div>
      </section>
        </>
      )}
    </div>
  );
}
