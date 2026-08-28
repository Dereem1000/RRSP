'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  Wrench,
  XCircle,
} from 'lucide-react';
import { ProvisioningPanel } from '@/components/developer-toolbox/ProvisioningPanel';
import type {
  DevSlotConfig,
  DevSlotHealth,
  DevSlotId,
  DevToolboxState,
} from '@/lib/developer-toolbox/types';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

function StatusDot({ health }: { health?: DevSlotHealth }) {
  const status = health?.status ?? 'unknown';
  if (status === 'up') return <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-label="Online" />;
  if (status === 'down') return <XCircle className="h-5 w-5 text-red-500" aria-label="Offline" />;
  if (status === 'cleared') return <Server className="h-5 w-5 text-slate-400" aria-label="Cleared" />;
  return <AlertTriangle className="h-5 w-5 text-amber-500" aria-label="Unknown" />;
}

export function DeveloperToolboxPageClient() {
  const [toolboxTab, setToolboxTab] = useState<'tunnel' | 'provisioning'>('tunnel');
  const [state, setState] = useState<DevToolboxState | null>(null);
  const [slots, setSlots] = useState<DevSlotConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [tunnelReady, setTunnelReady] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/developer-toolbox', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load');
      setState(data);
      setSlots(data.slots);
      setTunnelReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshHealth = async () => {
    setBusy('health');
    setError(null);
    try {
      const res = await fetch('/api/developer-toolbox/health', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Health check failed');
      setState(data);
      setSlots(data.slots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setBusy(null);
    }
  };

  const saveDraft = async (e: FormEvent) => {
    e.preventDefault();
    setBusy('save');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/developer-toolbox', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Save failed');
      setState(data);
      setSlots(data.slots);
      setMessage('Draft saved (tunnel not restarted yet).');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const applyAll = async () => {
    setBusy('apply');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/developer-toolbox/apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Apply failed');
      setState(data);
      setSlots(data.slots);
      setMessage(data.message || 'Tunnel updated and restarted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed');
    } finally {
      setBusy(null);
    }
  };

  const clearSlot = async (id: DevSlotId) => {
    if (!confirm(`Clear ${id} route and remove it from the tunnel?`)) return;
    setBusy(`clear-${id}`);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/developer-toolbox/slots/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Clear failed');
      setState(data);
      setSlots(data.slots);
      setMessage(data.message || `Cleared ${id}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setBusy(null);
    }
  };

  const dismissAlerts = async () => {
    setBusy('alerts');
    try {
      const res = await fetch('/api/developer-toolbox/health', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.success) setState(data);
    } finally {
      setBusy(null);
    }
  };

  const updateSlot = (id: DevSlotId, patch: Partial<DevSlotConfig>) => {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const unackedAlerts = state?.alerts.filter((a) => !a.acknowledged) ?? [];

  if (loading && toolboxTab === 'tunnel' && !tunnelReady) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading Developer Toolbox…
      </div>
    );
  }

  return (
    <div className="flex w-full min-h-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Wrench className="h-7 w-7 shrink-0 text-indigo-600" />
            Developer Toolbox
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Route <strong>dev1</strong>, <strong>dev2</strong>, and <strong>dev3</strong> to any LAN host. Apply
            restarts cloudflared only — portal, license API, and Mini keep running.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {toolboxTab === 'tunnel' && (
            <>
              <button
                type="submit"
                form="dev-tunnel-form"
                disabled={!!busy}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                type="button"
                onClick={() => void applyAll()}
                disabled={!!busy}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {busy === 'apply' ? (
                  <>
                    <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                    Applying…
                  </>
                ) : (
                  'Apply & restart tunnel'
                )}
              </button>
              <button
                type="button"
                onClick={() => void refreshHealth()}
                disabled={!!busy}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === 'health' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Check health
              </button>
            </>
          )}
        </div>
      </div>

      {unackedAlerts.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-red-800">Server alerts</p>
              <ul className="mt-2 space-y-1 text-sm text-red-700">
                {unackedAlerts.slice(0, 5).map((a) => (
                  <li key={a.id}>
                    {a.message}
                    <span className="ml-2 text-xs text-red-500">{new Date(a.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              onClick={() => void dismissAlerts()}
              className="text-xs font-medium text-red-700 underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="whitespace-pre-wrap rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          type="button"
          onClick={() => setToolboxTab('tunnel')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            toolboxTab === 'tunnel'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Dev tunnel
        </button>
        <button
          type="button"
          onClick={() => setToolboxTab('provisioning')}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            toolboxTab === 'provisioning'
              ? 'bg-indigo-600 text-white'
              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Provisioning
        </button>
      </nav>

      {toolboxTab === 'provisioning' ? (
        <ProvisioningPanel />
      ) : (
        <>
      {state && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600">
          <p>
            <strong>Tunnel:</strong> {state.tunnel.name} ({state.tunnel.id})
          </p>
          <p className="min-w-0 flex-1 truncate">
            <strong>Config:</strong> {state.tunnel.configPath}
          </p>
          {state.lastApplyAt && (
            <p className="shrink-0">
              <strong>Last apply:</strong> {new Date(state.lastApplyAt).toLocaleString()}
            </p>
          )}
        </div>
      )}

      <form id="dev-tunnel-form" onSubmit={saveDraft} className="flex min-h-0 flex-col gap-4">
        <div className="grid gap-4 lg:grid-cols-3">
          {slots.map((slot) => {
            const health = state?.health[slot.id];
            return (
              <div key={slot.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <StatusDot health={health} />
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold text-slate-900">{slot.label}</h2>
                      <a
                        href={`https://${slot.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 truncate text-xs text-indigo-600 hover:underline"
                      >
                        {slot.hostname}
                        <ExternalLink className="h-3 w-3 shrink-0" />
                      </a>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <label className="flex items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={(e) => updateSlot(slot.id, { enabled: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => void clearSlot(slot.id)}
                      disabled={!!busy}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {busy === `clear-${slot.id}` ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Trash2 className="h-3 w-3" />
                      )}
                      Clear
                    </button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Label</span>
                    <input
                      className={inputClass}
                      value={slot.label}
                      onChange={(e) => updateSlot(slot.id, { label: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Target IP</span>
                    <input
                      className={inputClass}
                      placeholder="192.168.1.50"
                      value={slot.host}
                      onChange={(e) => updateSlot(slot.id, { host: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Port</span>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      className={inputClass}
                      value={slot.port}
                      onChange={(e) => updateSlot(slot.id, { port: Number(e.target.value) })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block font-medium text-slate-700">Note</span>
                    <input
                      className={inputClass}
                      placeholder="CRM, POS demo…"
                      value={slot.note ?? ''}
                      onChange={(e) => updateSlot(slot.id, { note: e.target.value })}
                    />
                  </label>
                </div>

                {health && (
                  <p className="mt-2 text-xs text-slate-500">
                    <strong>{health.status}</strong>
                    {health.latencyMs != null && ` · ${health.latencyMs}ms`}
                    {health.error && ` · ${health.error}`}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </form>
        </>
      )}
    </div>
  );
}
