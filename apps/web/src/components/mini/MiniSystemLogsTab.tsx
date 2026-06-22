'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ScrollText, Server, Trash2 } from 'lucide-react';

type SystemLogConnection = {
  connection_id: string;
  system_key: string;
  system_name: string;
  company_name?: string;
  display_label?: string;
  crm_base_url?: string;
  status: string;
  log_count?: number;
  last_log_at?: string | null;
  last_event?: string | null;
};

type SystemLogEntry = {
  level?: string;
  category?: string;
  message?: string;
  details?: unknown;
  request_method?: string | null;
  request_path?: string | null;
  created_at?: string;
  received_at?: string;
};

type ExternalSystemsPayload = {
  system_logs?: {
    note?: string;
    connection_count?: number;
    pending_count?: number;
    accepted_count?: number;
    total_log_count?: number;
    connections?: SystemLogConnection[];
  };
};

function statusTone(status: string): string {
  const key = status.toLowerCase();
  if (key === 'accepted') return 'bg-emerald-100 text-emerald-800';
  if (key === 'pending') return 'bg-amber-100 text-amber-800';
  if (key === 'rejected' || key === 'disconnected') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}

function levelTone(level: string): string {
  const key = level.toLowerCase();
  if (key === 'error') return 'bg-red-100 text-red-800';
  if (key === 'warn' || key === 'warning') return 'bg-amber-100 text-amber-800';
  if (key === 'debug') return 'bg-slate-100 text-slate-600';
  return 'bg-sky-100 text-sky-800';
}

function parseLogTimestamp(value: string | undefined): string {
  if (!value) return '';
  const text = String(value).trim();
  const sqliteUtc = text.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (sqliteUtc) {
    return new Date(`${sqliteUtc[1]}T${sqliteUtc[2]}Z`).toLocaleString();
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(text)) {
    return new Date(`${text}Z`).toLocaleString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? text : parsed.toLocaleString();
}

function formatDetails(details: unknown): string {
  if (details == null || details === '') return '';
  if (typeof details === 'string') return details;
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

const CONNECTION_STATUS_ORDER: Record<string, number> = {
  accepted: 0,
  pending: 1,
  rejected: 2,
  disconnected: 3,
};

function sortConnections(rows: SystemLogConnection[]): SystemLogConnection[] {
  return [...rows].sort((left, right) => {
    const leftRank = CONNECTION_STATUS_ORDER[left.status.toLowerCase()] ?? 9;
    const rightRank = CONNECTION_STATUS_ORDER[right.status.toLowerCase()] ?? 9;
    if (leftRank !== rightRank) return leftRank - rightRank;
    const leftTime = Date.parse(left.last_log_at || '');
    const rightTime = Date.parse(right.last_log_at || '');
    if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return (left.company_name || left.system_name).localeCompare(right.company_name || right.system_name);
  });
}

function canForgetConnection(status: string): boolean {
  const key = status.toLowerCase();
  return key === 'disconnected' || key === 'rejected';
}

export function MiniSystemLogsTab() {
  const [systems, setSystems] = useState<ExternalSystemsPayload | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [forgettingId, setForgettingId] = useState('');
  const [error, setError] = useState('');

  const connections = useMemo(
    () => sortConnections(systems?.system_logs?.connections || []),
    [systems]
  );

  const selectedConnection = useMemo(
    () => connections.find((row) => row.connection_id === selectedId) || null,
    [connections, selectedId]
  );

  const loadSystems = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/mini/external-systems', { cache: 'no-store' });
      const data = (await res.json()) as ExternalSystemsPayload & { error?: string };
      if (!res.ok) throw new Error(data.error || 'Failed to load connected systems');
      setSystems(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load connected systems');
      return null;
    } finally {
      setLoadingSystems(false);
    }
  }, []);

  const loadLogs = useCallback(async (connectionId: string) => {
    if (!connectionId) {
      setLogs([]);
      return;
    }
    setLoadingLogs(true);
    setError('');
    try {
      const res = await fetch(
        `/api/mini/external-systems/system-logs/${encodeURIComponent(connectionId)}/logs?limit=200`,
        { cache: 'no-store' }
      );
      const data = (await res.json()) as { logs?: SystemLogEntry[]; error?: string };
      if (res.ok) {
        setLogs(data.logs || []);
        return;
      }

      const systemsRes = await fetch('/api/mini/external-systems', { cache: 'no-store' });
      const systemsData = (await systemsRes.json()) as ExternalSystemsPayload & {
        system_logs?: { recent_logs?: Array<SystemLogEntry & { connection_id?: string }> };
        error?: string;
      };
      if (!systemsRes.ok) {
        throw new Error(data.error || systemsData.error || 'Failed to load system logs');
      }

      const recent = systemsData.system_logs?.recent_logs || [];
      setLogs(recent.filter((entry) => entry.connection_id === connectionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load system logs');
      setLogs([]);
    } finally {
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    loadSystems().then((data) => {
      const rows = sortConnections(data?.system_logs?.connections || []);
      if (!rows.length) return;
      const preferred =
        rows.find((row) => row.status === 'accepted')?.connection_id || rows[0]?.connection_id || '';
      if (preferred) setSelectedId(preferred);
    });
  }, [loadSystems]);

  useEffect(() => {
    if (selectedId) loadLogs(selectedId);
  }, [selectedId, loadLogs]);

  async function refreshAll() {
    setLoadingSystems(true);
    const data = await loadSystems();
    const rows = sortConnections(data?.system_logs?.connections || []);
    const stillExists = rows.some((row) => row.connection_id === selectedId);
    const nextId =
      (stillExists ? selectedId : '') ||
      rows.find((row) => row.status === 'accepted')?.connection_id ||
      rows[0]?.connection_id ||
      '';
    if (nextId !== selectedId) setSelectedId(nextId);
    else if (nextId) await loadLogs(nextId);
  }

  async function forgetConnection(connectionId: string) {
    setForgettingId(connectionId);
    setError('');
    try {
      const res = await fetch('/api/mini/external-systems/system-logs/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connection_id: connectionId }),
      });
      const data = (await res.json()) as { error?: string; external_systems?: ExternalSystemsPayload };
      if (!res.ok) throw new Error(data.error || 'Failed to remove connection');
      if (data.external_systems) setSystems(data.external_systems);
      else await loadSystems();
      if (selectedId === connectionId) {
        const rows = sortConnections(data.external_systems?.system_logs?.connections || connections);
        const nextId = rows.find((row) => row.status === 'accepted')?.connection_id || rows[0]?.connection_id || '';
        setSelectedId(nextId);
        if (!nextId) setLogs([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove connection');
    } finally {
      setForgettingId('');
    }
  }

  if (loadingSystems && !systems) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading connected systems…
      </div>
    );
  }

  const summary = systems?.system_logs;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-sky-700" />
            <h2 className="text-lg font-semibold text-slate-900">External system logs</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {summary?.note ||
              'Logs forwarded from applications connected to Mini. Select a system to view its recent entries.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void refreshAll();
          }}
          disabled={loadingSystems || loadingLogs}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loadingSystems || loadingLogs ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Connections</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary?.connection_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Accepted</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{summary?.accepted_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{summary?.pending_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total logs</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{summary?.total_log_count ?? 0}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Server className="h-4 w-4 text-sky-700" />
            <h3 className="text-sm font-semibold text-slate-900">Connected systems</h3>
          </div>
          {connections.length === 0 ? (
            <p className="text-sm text-slate-500">
              No systems registered yet. Enable log forwarding from an external app in Mini&apos;s External Systems
              tab.
            </p>
          ) : (
            <div className="space-y-2">
              {connections.map((connection) => {
                const active = connection.connection_id === selectedId;
                const forgettable = canForgetConnection(connection.status);
                return (
                  <div
                    key={connection.connection_id}
                    className={`rounded-xl border px-3 py-3 transition ${
                      active
                        ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-200'
                        : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setSelectedId(connection.connection_id)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">
                            {connection.display_label || connection.system_name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {connection.company_name ? `${connection.company_name} · ` : ''}
                            {connection.system_key}
                            {connection.crm_base_url ? ` · ${connection.crm_base_url}` : ''}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(connection.status)}`}
                        >
                          {connection.status}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        {connection.log_count ?? 0} logs
                        {connection.last_log_at ? ` · last ${parseLogTimestamp(connection.last_log_at)}` : ''}
                      </p>
                      {connection.last_event && (
                        <p className="mt-1 truncate text-xs text-slate-400">{connection.last_event}</p>
                      )}
                    </button>
                    {forgettable && (
                      <button
                        type="button"
                        onClick={() => {
                          void forgetConnection(connection.connection_id);
                        }}
                        disabled={forgettingId === connection.connection_id}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                      >
                        {forgettingId === connection.connection_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Remove from list
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              {selectedConnection
                ? `${selectedConnection.display_label || selectedConnection.system_name} logs`
                : 'System logs'}
            </h3>
            {loadingLogs && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>

          {!selectedConnection ? (
            <p className="text-sm text-slate-500">Select a connected system to view its logs.</p>
          ) : logs.length === 0 ? (
            <p className="text-sm text-slate-500">
              {loadingLogs ? 'Loading logs…' : 'No log entries received for this system yet.'}
            </p>
          ) : (
            <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {logs.map((entry, index) => {
                const requestLine =
                  entry.request_method && entry.request_path
                    ? `${entry.request_method} ${entry.request_path}`
                    : null;
                const meta = [entry.category, requestLine].filter(Boolean).join(' · ');
                const details = formatDetails(entry.details);
                return (
                  <article
                    key={`${entry.created_at || entry.received_at || 'log'}-${index}`}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-900">{entry.message || 'Log entry'}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${levelTone(entry.level || 'info')}`}
                      >
                        {entry.level || 'info'}
                      </span>
                    </div>
                    {meta && <p className="mt-1 text-xs text-slate-600">{meta}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      {parseLogTimestamp(entry.created_at || entry.received_at)}
                    </p>
                    {details && (
                      <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-white p-2 text-[11px] text-slate-700">
                        {details}
                      </pre>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
