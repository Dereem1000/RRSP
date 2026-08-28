'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, RefreshCw, ScrollText, Server, Settings, Trash2, Upload } from 'lucide-react';
import { apiErrorMessage, parseFetchJsonResponse } from '@/lib/parse-fetch-json';

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
  integration_kit_version?: string | null;
  integration_kit_current_version?: string | null;
  integration_kit_update_available?: boolean;
  integration_kit_version_status?: 'current' | 'outdated' | 'unknown' | string;
  auto_updates_suspended?: boolean;
  auto_updates_suspended_at?: string | null;
};

type IntegrationKitCatalog = {
  current_version?: string;
  released_at?: string | null;
  project?: string;
};

type ExternalSystemsPayload = {
  system_logs?: {
    note?: string;
    connection_count?: number;
    pending_count?: number;
    accepted_count?: number;
    total_log_count?: number;
    integration_kit?: IntegrationKitCatalog;
    connections?: SystemLogConnection[];
  };
};

type SystemLogEntry = {
  level?: string | number;
  category?: string;
  message?: string;
  details?: unknown;
  request_method?: string | null;
  request_path?: string | null;
  created_at?: string;
  received_at?: string;
};

function kitStatusTone(status: string | undefined): string {
  const key = String(status || 'unknown').toLowerCase();
  if (key === 'current') return 'bg-emerald-100 text-emerald-800';
  if (key === 'outdated') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-600';
}

function formatKitVersionLabel(connection: SystemLogConnection, catalog?: IntegrationKitCatalog): string {
  const installed = connection.integration_kit_version
    ? `v${connection.integration_kit_version}`
    : 'unknown';
  const current = connection.integration_kit_current_version
    ? `v${connection.integration_kit_current_version}`
    : catalog?.current_version
      ? `v${catalog.current_version}`
      : '—';
  return `${installed} / Mini ${current}`;
}

function statusTone(status: string): string {
  const key = status.toLowerCase();
  if (key === 'accepted') return 'bg-emerald-100 text-emerald-800';
  if (key === 'pending') return 'bg-amber-100 text-amber-800';
  if (key === 'rejected' || key === 'disconnected') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}

function levelTone(level: string | number | undefined): string {
  const key = String(level || 'info').toLowerCase();
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

const LOG_LEVEL_FILTERS = ['all', 'error', 'warn', 'info', 'debug'] as const;
const LOG_CATEGORY_PRESETS = ['project_guard', 'license', 'api', 'console', 'general'] as const;

type LogLevelFilter = (typeof LOG_LEVEL_FILTERS)[number];
type LogCategoryFilter = string;

function normalizeLogLevel(level: string | number | undefined): string {
  const key = String(level || 'info').toLowerCase();
  return key === 'warning' ? 'warn' : key;
}

function matchesLogLevel(entry: SystemLogEntry, filter: LogLevelFilter): boolean {
  if (filter === 'all') return true;
  return normalizeLogLevel(entry.level) === filter;
}

function matchesLogCategory(entry: SystemLogEntry, filter: LogCategoryFilter): boolean {
  if (filter === 'all') return true;
  const category = String(entry.category || 'general').toLowerCase();
  const needle = filter.toLowerCase();
  if (needle === 'console') return category.startsWith('console');
  return category === needle || category.startsWith(`${needle}:`);
}

function formatCategoryLabel(category: string): string {
  return category
    .replace(/[:_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function collectCategoryOptions(logs: SystemLogEntry[]): string[] {
  const discovered = new Set<string>();
  for (const entry of logs) {
    const category = String(entry.category || '').trim().toLowerCase();
    if (!category) continue;
    if (category.startsWith('console')) {
      discovered.add('console');
      continue;
    }
    discovered.add(category.split(':')[0] || category);
  }
  const ordered: string[] = [];
  for (const preset of LOG_CATEGORY_PRESETS) {
    if (preset === 'console') {
      if ([...discovered].some((item) => item.startsWith('console'))) ordered.push('console');
      continue;
    }
    if (discovered.has(preset)) ordered.push(preset);
  }
  for (const category of [...discovered].sort()) {
    if (!ordered.includes(category)) ordered.push(category);
  }
  return ordered;
}

export function MiniSystemLogsTab() {
  const [systems, setSystems] = useState<ExternalSystemsPayload | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [loadingSystems, setLoadingSystems] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [forgettingId, setForgettingId] = useState('');
  const [pushingKitId, setPushingKitId] = useState('');
  const [settingsMenuId, setSettingsMenuId] = useState('');
  const [updatingSettingsId, setUpdatingSettingsId] = useState('');
  const [kitNotice, setKitNotice] = useState('');
  const [error, setError] = useState('');
  const settingsMenuRef = useRef<HTMLDivElement | null>(null);
  const [levelFilter, setLevelFilter] = useState<LogLevelFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<LogCategoryFilter>('all');

  const connections = useMemo(
    () => sortConnections(systems?.system_logs?.connections || []),
    [systems]
  );

  const selectedConnection = useMemo(
    () => connections.find((row) => row.connection_id === selectedId) || null,
    [connections, selectedId]
  );

  const categoryOptions = useMemo(() => collectCategoryOptions(logs), [logs]);

  const filteredLogs = useMemo(
    () => logs.filter((entry) => matchesLogLevel(entry, levelFilter) && matchesLogCategory(entry, categoryFilter)),
    [logs, levelFilter, categoryFilter]
  );

  const loadSystems = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/mini/external-systems', { cache: 'no-store', credentials: 'include' });
      const data = await parseFetchJsonResponse<ExternalSystemsPayload & { error?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Failed to load connected systems'));
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
        { cache: 'no-store', credentials: 'include' }
      );
      const data = await parseFetchJsonResponse<{ logs?: SystemLogEntry[]; error?: string }>(res);
      if (res.ok) {
        setLogs(data.logs || []);
        return;
      }

      const systemsRes = await fetch('/api/mini/external-systems', { cache: 'no-store', credentials: 'include' });
      const systemsData = await parseFetchJsonResponse<
        ExternalSystemsPayload & {
          system_logs?: { recent_logs?: Array<SystemLogEntry & { connection_id?: string }> };
          error?: string;
        }
      >(systemsRes);
      if (!systemsRes.ok) {
        throw new Error(apiErrorMessage(data, apiErrorMessage(systemsData, 'Failed to load system logs')));
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

  useEffect(() => {
    setCategoryFilter('all');
    setLevelFilter('all');
  }, [selectedId]);

  useEffect(() => {
    if (categoryFilter === 'all') return;
    if (!categoryOptions.includes(categoryFilter)) setCategoryFilter('all');
  }, [categoryFilter, categoryOptions]);

  useEffect(() => {
    if (!settingsMenuId) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (settingsMenuRef.current && target && !settingsMenuRef.current.contains(target)) {
        setSettingsMenuId('');
      }
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [settingsMenuId]);

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

  function formatKitPushTarget(connection: SystemLogConnection): string {
    const name = connection.display_label || connection.system_name || 'External system';
    const url = connection.crm_base_url?.trim();
    return url ? `${name} (${url})` : name;
  }

  async function pushKitUpdate(connection: SystemLogConnection) {
    const targetLabel = formatKitPushTarget(connection);
    setPushingKitId(connection.connection_id);
    setError('');
    setKitNotice(`Pushing integration kit update to ${targetLabel}… this can take several minutes.`);
    try {
      const res = await fetch('/api/mini/external-systems/system-logs/push-kit-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connection_id: connection.connection_id }),
      });
      const data = await parseFetchJsonResponse<{
        error?: string;
        message?: string;
        hint?: string;
        target?: { system_name?: string; crm_base_url?: string };
        remote?: { body?: string; error?: string };
        sync?: { error?: string };
        project_guard_baseline_refresh?: { updated_count?: number; skipped?: boolean; reason?: string };
        system_logs?: ExternalSystemsPayload['system_logs'];
        external_systems?: ExternalSystemsPayload;
      }>(res);
      const failureMessage = apiErrorMessage(data, 'Failed to push integration kit update');
      if (!res.ok || (typeof data.error === 'string' && data.error.trim())) {
        const responseTarget = data.target?.crm_base_url
          ? `${data.target.system_name || 'Target'} (${data.target.crm_base_url})`
          : targetLabel;
        const parts = [
          `[${responseTarget}]`,
          typeof data.error === 'string' && data.error.trim() ? data.error : failureMessage,
          data.hint,
          data.remote?.body ? `Remote: ${data.remote.body.slice(0, 240)}` : null,
          data.remote?.error ? `Remote: ${data.remote.error}` : null,
          data.sync?.error ? `Library sync: ${data.sync.error}` : null,
        ].filter(Boolean);
        throw new Error(parts.join(' — '));
      }
      const guardRefresh = data.project_guard_baseline_refresh;
      if (guardRefresh?.updated_count) {
        setKitNotice(
          `Kit update applied. Project Guard baseline refreshed for ${guardRefresh.updated_count} file(s).`,
        );
      } else if (guardRefresh?.skipped) {
        setKitNotice(
          'Kit update applied on the product. Configure Project Guard pairing URL to auto-refresh guarded baselines after kit pushes.',
        );
      } else {
        setKitNotice(`Integration kit update pushed successfully to ${targetLabel}.`);
      }
      if (data.system_logs) {
        setSystems({ system_logs: data.system_logs });
      } else if (data.external_systems?.system_logs) {
        setSystems(data.external_systems);
      } else {
        await loadSystems();
      }
    } catch (err) {
      setKitNotice('');
      setError(err instanceof Error ? err.message : 'Failed to push integration kit update');
    } finally {
      setPushingKitId('');
    }
  }

  async function updateConnectionSettings(connectionId: string, autoUpdatesSuspended: boolean) {
    setUpdatingSettingsId(connectionId);
    setError('');
    setKitNotice('');
    try {
      const res = await fetch('/api/mini/external-systems/system-logs/connection-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          connection_id: connectionId,
          auto_updates_suspended: autoUpdatesSuspended,
        }),
      });
      const data = await parseFetchJsonResponse<{
        error?: string;
        remote_sync_warning?: string;
        external_systems?: ExternalSystemsPayload;
      }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Failed to update connection settings'));
      if (data.external_systems) setSystems(data.external_systems);
      else await loadSystems();
      const label = autoUpdatesSuspended ? 'Auto updates suspended' : 'Auto updates resumed';
      setKitNotice(data.remote_sync_warning ? `${label}. ${data.remote_sync_warning}` : `${label}.`);
      setSettingsMenuId('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update connection settings');
    } finally {
      setUpdatingSettingsId('');
    }
  }

  async function forgetConnection(connectionId: string) {
    setForgettingId(connectionId);
    setError('');
    try {
      const res = await fetch('/api/mini/external-systems/system-logs/forget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ connection_id: connectionId }),
      });
      const data = await parseFetchJsonResponse<{ error?: string; external_systems?: ExternalSystemsPayload }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Failed to remove connection'));
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
  const kitCatalog = summary?.integration_kit;

  return (
    <div className="min-w-0 space-y-4">
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
      {kitNotice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {kitNotice}
        </div>
      ) : null}

      <div className="grid min-w-0 gap-4 md:grid-cols-5">
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
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Kit version (Mini)</p>
          <p className="mt-1 text-2xl font-bold text-sky-700">
            {kitCatalog?.current_version ? `v${kitCatalog.current_version}` : '—'}
          </p>
        </div>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
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
            <div className="max-h-[min(32rem,calc(100dvh-18rem))] space-y-2 overflow-y-auto pr-1">
              {connections.map((connection) => {
                const active = connection.connection_id === selectedId;
                const forgettable = canForgetConnection(connection.status);
                const kitLabel = formatKitVersionLabel(connection, kitCatalog);
                const kitStatus = connection.integration_kit_version_status || 'unknown';
                const showKitPush =
                  connection.status === 'accepted' && Boolean(connection.integration_kit_update_available);
                const autoUpdatesSuspended = Boolean(connection.auto_updates_suspended);
                const settingsOpen = settingsMenuId === connection.connection_id;
                return (
                  <div
                    key={connection.connection_id}
                    className={`relative min-w-0 rounded-xl border px-3 py-3 transition ${
                      active
                        ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-200'
                        : 'border-slate-100 bg-slate-50 hover:border-slate-200 hover:bg-white'
                    }`}
                  >
                    <div className="absolute right-3 top-3 z-10" ref={settingsOpen ? settingsMenuRef : null}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSettingsMenuId((current) =>
                            current === connection.connection_id ? '' : connection.connection_id
                          );
                        }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900"
                        title="Connection settings"
                        aria-label="Connection settings"
                      >
                        {updatingSettingsId === connection.connection_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Settings className="h-3.5 w-3.5" />
                        )}
                      </button>
                      {settingsOpen ? (
                        <div className="absolute right-0 top-[calc(100%+0.35rem)] min-w-[15rem] rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Connection settings
                          </p>
                          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                            <input
                              type="checkbox"
                              checked={autoUpdatesSuspended}
                              disabled={updatingSettingsId === connection.connection_id}
                              onChange={(event) => {
                                void updateConnectionSettings(connection.connection_id, event.target.checked);
                              }}
                              className="rounded border-slate-300 text-sky-700 focus:ring-sky-500/30"
                            />
                            Suspend auto updates
                          </label>
                          {autoUpdatesSuspended ? (
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">
                              Automatic kit and library updates are paused for this site.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setSelectedId(connection.connection_id)}
                      className="w-full pr-10 text-left"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900">
                            {connection.display_label || connection.system_name}
                          </p>
                          <p className="mt-0.5 break-all text-xs text-slate-500">
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
                        Integration kit:{' '}
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${kitStatusTone(kitStatus)}`}
                        >
                          {kitStatus}
                        </span>{' '}
                        <span className="font-medium text-slate-700">{kitLabel}</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        Auto updates:{' '}
                        <span
                          className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                            autoUpdatesSuspended ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {autoUpdatesSuspended ? 'Suspended' : 'Active'}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-600">
                        {connection.log_count ?? 0} logs
                        {connection.last_log_at ? ` · last ${parseLogTimestamp(connection.last_log_at)}` : ''}
                      </p>
                      {connection.last_event && (
                        <p className="mt-1 truncate text-xs text-slate-400">{connection.last_event}</p>
                      )}
                    </button>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {showKitPush && (
                        <button
                          type="button"
                          onClick={() => {
                            void pushKitUpdate(connection);
                          }}
                          disabled={pushingKitId === connection.connection_id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                        >
                          {pushingKitId === connection.connection_id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Upload className="h-3 w-3" />
                          )}
                          Push kit update
                        </button>
                      )}
                      {forgettable && (
                        <button
                          type="button"
                          onClick={() => {
                            void forgetConnection(connection.connection_id);
                          }}
                          disabled={forgettingId === connection.connection_id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
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
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-24 lg:self-start">
          <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-900">
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
            <>
              <div className="mb-3 flex flex-wrap items-end gap-3">
                <label className="min-w-[8rem] text-xs text-slate-600">
                  <span className="mb-1 block font-medium uppercase tracking-wide text-slate-500">Level</span>
                  <select
                    value={levelFilter}
                    onChange={(event) => setLevelFilter(event.target.value as LogLevelFilter)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
                  >
                    <option value="all">All levels</option>
                    <option value="error">Error</option>
                    <option value="warn">Warning</option>
                    <option value="info">Info</option>
                    <option value="debug">Debug</option>
                  </select>
                </label>
                <label className="min-w-[10rem] flex-1 text-xs text-slate-600">
                  <span className="mb-1 block font-medium uppercase tracking-wide text-slate-500">Category</span>
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800"
                  >
                    <option value="all">All categories</option>
                    {categoryOptions.map((category) => (
                      <option key={category} value={category}>
                        {formatCategoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="pb-1 text-xs text-slate-500">
                  Showing {filteredLogs.length} of {logs.length}
                </p>
              </div>
              {filteredLogs.length === 0 ? (
                <p className="text-sm text-slate-500">No logs match the selected filters.</p>
              ) : (
                <div className="max-h-[min(32rem,calc(100dvh-18rem))] min-w-0 space-y-2 overflow-y-auto pr-1">
                  {filteredLogs.map((entry, index) => {
                    const requestLine =
                      entry.request_method && entry.request_path
                        ? `${entry.request_method} ${entry.request_path}`
                        : null;
                    const meta = [entry.category, requestLine].filter(Boolean).join(' · ');
                    const details = formatDetails(entry.details);
                    return (
                      <article
                        key={`${entry.created_at || entry.received_at || 'log'}-${index}`}
                        className="min-w-0 rounded-xl border border-slate-100 bg-slate-50 p-3"
                      >
                        <div className="flex min-w-0 items-start justify-between gap-2">
                          <p className="min-w-0 break-words text-sm font-medium text-slate-900">
                            {entry.message || 'Log entry'}
                          </p>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${levelTone(entry.level)}`}
                          >
                            {normalizeLogLevel(entry.level)}
                          </span>
                        </div>
                        {meta && <p className="mt-1 break-all text-xs text-slate-600">{meta}</p>}
                        <p className="mt-1 text-xs text-slate-400">
                          {parseLogTimestamp(entry.created_at || entry.received_at)}
                        </p>
                        {details && (
                          <pre className="mt-2 max-h-40 max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-white p-2 text-[11px] text-slate-700">
                            {details}
                          </pre>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
