'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
} from 'lucide-react';

export type SecurityEventRow = {
  id: number;
  eventType: string;
  severity: string;
  description: string;
  outcome: string;
  userId?: number | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  details?: Record<string, unknown>;
  isActive?: boolean;
  createdAt: string;
};

const SEVERITY_STYLES: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-800',
  medium: 'bg-amber-50 text-amber-900',
  high: 'bg-orange-50 text-orange-900',
  critical: 'bg-red-50 text-red-800',
};

const EVENT_TYPE_OPTIONS = [
  '',
  'intrusion_detected',
  'sql_injection',
  'xss_attempt',
  'path_traversal',
  'bot_detected',
  'threat_detected',
  'ip_blocked',
  'rate_limited',
  'suspicious_activity',
  'file_integrity',
  'login_attempt',
];

type IpIntel = {
  ip: string;
  city?: string;
  region?: string;
  country?: string;
  org?: string;
  timezone?: string;
};

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
        SEVERITY_STYLES[severity] ?? 'bg-slate-100 text-slate-700'
      }`}
    >
      {severity}
    </span>
  );
}

function formatWhen(value: string) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

export function SecurityEventsPageClient({
  initialIp = '',
}: {
  initialIp?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<SecurityEventRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [blocking, setBlocking] = useState(false);
  const [ipIntel, setIpIntel] = useState<IpIntel | null>(null);

  const [draft, setDraft] = useState({
    q: '',
    severity: '',
    eventType: '',
    ip: initialIp,
    includeInactive: true,
  });
  const [applied, setApplied] = useState(draft);

  const activeIp = applied.ip.trim();

  const load = useCallback(async (next = applied) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (next.q.trim()) params.set('q', next.q.trim());
      if (next.severity) params.set('severity', next.severity);
      if (next.eventType) params.set('eventType', next.eventType);
      if (next.ip.trim()) params.set('ip', next.ip.trim());
      if (next.includeInactive) params.set('includeInactive', '1');

      const res = await fetch(`/api/security/events?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load events');
      setEvents(data.events ?? []);
      setTotal(typeof data.total === 'number' ? data.total : (data.events?.length ?? 0));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load events');
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const ipFromUrl = searchParams?.get('ip')?.trim() ?? '';
    if (ipFromUrl && ipFromUrl !== applied.ip) {
      const next = { ...draft, ip: ipFromUrl };
      setDraft(next);
      setApplied(next);
    }
    // Only sync when the URL ip changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!activeIp) {
      setIpIntel(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://ipinfo.io/${encodeURIComponent(activeIp)}/json`);
        if (!res.ok) return;
        const data = (await res.json()) as IpIntel;
        if (!cancelled) setIpIntel(data);
      } catch {
        if (!cancelled) {
          setIpIntel({
            ip: activeIp,
            org: 'Lookup unavailable',
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeIp]);

  const intrusionCount = useMemo(
    () =>
      events.filter((e) =>
        ['intrusion_detected', 'sql_injection', 'xss_attempt', 'path_traversal', 'bot_detected', 'threat_detected'].includes(
          e.eventType
        )
      ).length,
    [events]
  );

  function applyFilters(next = draft) {
    setApplied(next);
    const params = new URLSearchParams();
    if (next.ip.trim()) params.set('ip', next.ip.trim());
    const qs = params.toString();
    router.replace(qs ? `/settings/security/events?${qs}` : '/settings/security/events');
  }

  async function blockIp(ip: string) {
    if (!ip) return;
    if (!confirm(`Block ${ip}? Future requests from this address will be rejected.`)) return;
    setBlocking(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/security/blocked-ips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'block',
          ip,
          reason: 'Manual block from security events investigation',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Block failed');
      setMessage(data.message || `Blocked ${ip}`);
      void load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Block failed');
    } finally {
      setBlocking(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/settings?tab=security"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Security settings
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Security events</h1>
          <p className="mt-1 text-sm text-slate-500">
            Full audit trail with IP, user agent, outcome, and event details.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {activeIp && (
        <section className="rounded-2xl border border-orange-200 bg-orange-50/40 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-orange-700" />
              <div>
                <h2 className="font-semibold text-slate-900">IP investigation</h2>
                <p className="mt-1 font-mono text-sm text-slate-800">{activeIp}</p>
                <dl className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs uppercase text-slate-400">Network</dt>
                    <dd>{ipIntel?.org || 'Looking up…'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-400">Location</dt>
                    <dd>
                      {[ipIntel?.city, ipIntel?.region, ipIntel?.country].filter(Boolean).join(', ') ||
                        'Looking up…'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-400">Timezone</dt>
                    <dd>{ipIntel?.timezone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase text-slate-400">Matching events</dt>
                    <dd>
                      {total} total · {intrusionCount} intrusion-class in this page
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <a
                    href={`https://ipinfo.io/${encodeURIComponent(activeIp)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                  >
                    ipinfo.io <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={`https://www.abuseipdb.com/check/${encodeURIComponent(activeIp)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                  >
                    AbuseIPDB <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={`https://www.virustotal.com/gui/ip-address/${encodeURIComponent(activeIp)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-700 hover:underline"
                  >
                    VirusTotal <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={blocking}
              onClick={() => void blockIp(activeIp)}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {blocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              Block IP
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <form
          className="grid gap-3 lg:grid-cols-[1fr_140px_180px_180px_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters(draft);
          }}
        >
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={draft.q}
              onChange={(e) => setDraft((prev) => ({ ...prev, q: e.target.value }))}
              placeholder="Search description, type, IP…"
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            />
          </label>
          <select
            value={draft.severity}
            onChange={(e) => setDraft((prev) => ({ ...prev, severity: e.target.value }))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={draft.eventType}
            onChange={(e) => setDraft((prev) => ({ ...prev, eventType: e.target.value }))}
            className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="">All event types</option>
            {EVENT_TYPE_OPTIONS.filter(Boolean).map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
          <input
            value={draft.ip}
            onChange={(e) => setDraft((prev) => ({ ...prev, ip: e.target.value }))}
            placeholder="Filter by IP"
            className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
          >
            Apply
          </button>
        </form>
        <label className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={draft.includeInactive}
            onChange={(e) => {
              const next = { ...draft, includeInactive: e.target.checked };
              setDraft(next);
              applyFilters(next);
            }}
          />
          Include cleared / inactive events
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm text-slate-600">
            Showing <span className="font-semibold text-slate-900">{events.length}</span>
            {total > events.length ? (
              <>
                {' '}
                of <span className="font-semibold text-slate-900">{total}</span>
              </>
            ) : null}{' '}
            events
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading events…
          </div>
        ) : events.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm text-slate-500">
            {activeIp
              ? `No security events found for ${activeIp} in this database (including inactive).`
              : 'No security events match these filters.'}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {events.map((ev) => {
              const open = expanded === ev.id;
              return (
                <li key={ev.id} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : ev.id)}
                    className="flex w-full items-start gap-3 text-left"
                  >
                    {open ? (
                      <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                    ) : (
                      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900">{ev.eventType}</span>
                        <SeverityBadge severity={ev.severity} />
                        {!ev.isActive && (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                            cleared
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{formatWhen(ev.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{ev.description}</p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {ev.ipAddress && (
                          <span
                            role="button"
                            tabIndex={0}
                            className="cursor-pointer font-mono text-indigo-700 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              const next = { ...draft, ip: ev.ipAddress || '' };
                              setDraft(next);
                              applyFilters(next);
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter' && e.key !== ' ') return;
                              e.preventDefault();
                              e.stopPropagation();
                              const next = { ...draft, ip: ev.ipAddress || '' };
                              setDraft(next);
                              applyFilters(next);
                            }}
                          >
                            {ev.ipAddress}
                          </span>
                        )}
                        <span>Outcome: {ev.outcome || '—'}</span>
                        {ev.userId != null && <span>User #{ev.userId}</span>}
                      </div>
                    </div>
                  </button>

                  {open && (
                    <div className="mt-3 ml-7 space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-400">User agent</p>
                        <p className="mt-1 break-all font-mono text-xs text-slate-700">
                          {ev.userAgent || '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-slate-400">Details</p>
                        <pre className="mt-1 overflow-x-auto rounded-lg bg-white p-3 text-xs text-slate-700">
                          {JSON.stringify(ev.details ?? {}, null, 2)}
                        </pre>
                      </div>
                      {ev.ipAddress && (
                        <button
                          type="button"
                          disabled={blocking}
                          onClick={() => void blockIp(ev.ipAddress!)}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          <Ban className="h-3.5 w-3.5" />
                          Block {ev.ipAddress}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
