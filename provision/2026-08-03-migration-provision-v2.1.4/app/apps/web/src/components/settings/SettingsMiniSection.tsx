'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { Bot, Copy, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

type MiniDockSettings = {
  docked: boolean;
  installPath: string;
  localUrl: string;
  publicUrl: string;
  port: number;
  startWithCd: boolean;
  apiTokenConfigured: boolean;
  tokenPreview: string | null;
  connected: boolean;
  lastSeenAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
};

export function SettingsMiniSection({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [settings, setSettings] = useState<MiniDockSettings | null>(null);
  const [installPath, setInstallPath] = useState('');
  const [localUrl, setLocalUrl] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [docked, setDocked] = useState(false);
  const [startWithCd, setStartWithCd] = useState(true);
  const [miniOnline, setMiniOnline] = useState(false);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const [settingsRes, statusRes] = await Promise.all([
        fetch('/api/settings/mini'),
        fetch('/api/mini/status', { cache: 'no-store' }),
      ]);
      const data = await settingsRes.json();
      if (!settingsRes.ok) throw new Error(data.message || 'Failed to load Mini settings');
      setSettings(data.settings);
      setInstallPath(data.settings?.installPath || '');
      setLocalUrl(data.settings?.localUrl || '');
      setPublicUrl(data.settings?.publicUrl || '');
      setDocked(Boolean(data.settings?.docked));
      setStartWithCd(data.settings?.startWithCd !== false);

      if (statusRes.ok) {
        const status = await statusRes.json();
        setMiniOnline(Boolean(status.online));
      } else {
        setMiniOnline(false);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load Mini settings');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      onMessage('Copied to clipboard');
    } catch {
      onError('Could not copy to clipboard');
    }
  }

  async function testConnection() {
    setSaving('test');
    onError('');
    onMessage('');
    try {
      const res = await fetch('/api/settings/mini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.probe?.message || data.message || 'Mini test failed');
      onMessage(data.probe?.message || 'Mini is reachable');
      setMiniOnline(Boolean(data.probe?.ok));
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Mini test failed');
    } finally {
      setSaving('');
    }
  }

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving('save');
    onError('');
    onMessage('');
    try {
      const res = await fetch('/api/settings/mini', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docked,
          installPath,
          localUrl,
          publicUrl,
          startWithCd,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save Mini settings');
      if (data.apiToken) {
        setRevealedToken(data.apiToken);
      }
      onMessage(data.message || 'Mini settings saved');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save Mini settings');
    } finally {
      setSaving('');
    }
  }

  async function regenerateToken() {
    if (!confirm('Generate a new Mini API token? Update Mini runtime/local.env and restart Mini.')) return;
    setSaving('token');
    onError('');
    try {
      const res = await fetch('/api/settings/mini', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docked,
          installPath,
          localUrl,
          publicUrl,
          startWithCd,
          regenerateToken: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to regenerate token');
      setRevealedToken(data.apiToken ?? null);
      onMessage('New Mini API token generated and written to Mini local.env');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to regenerate token');
    } finally {
      setSaving('');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Mini integration settings…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Bot className="mt-0.5 h-5 w-5 text-sky-700" />
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Mini assistant dock</h4>
            <p className="mt-1 text-xs text-slate-600">
              Point Computer Dynamics at Mini&apos;s install folder. When docked, CD can start Mini with{' '}
              <code className="rounded bg-white px-1">start_mini_headless.bat</code> and expose her dashboard in the
              portal only while she is actually running.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={!!saving}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
        <p>
          Integration: <strong>{settings?.docked ? 'Enabled' : 'Off'}</strong>
        </p>
        <p>
          Mini running:{' '}
          <strong className={miniOnline ? 'text-emerald-700' : 'text-amber-700'}>
            {settings?.docked ? (miniOnline ? 'Yes' : 'No — start Mini') : '—'}
          </strong>
        </p>
        <p>
          API token: <strong>{settings?.apiTokenConfigured ? 'Configured' : 'Not set'}</strong>
        </p>
        <p className="text-xs text-slate-500">
          {settings?.lastError
            ? `Error: ${settings.lastError}`
            : settings?.lastSeenAt
              ? `Last seen ${new Date(settings.lastSeenAt).toLocaleString()}`
              : settings?.docked
                ? 'Not reachable yet'
                : 'Not probed yet'}
        </p>
      </div>

      {revealedToken && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-xs font-medium text-emerald-900">Mini API token — copy for external systems</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="flex-1 break-all rounded-lg bg-white px-3 py-2 text-xs text-slate-800">{revealedToken}</code>
            <button
              type="button"
              onClick={() => copyText(revealedToken)}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-800">
            Public Mini URL for remote systems: <strong>{publicUrl || settings?.publicUrl}</strong>
          </p>
        </div>
      )}

      <form onSubmit={saveSettings} className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={docked} onChange={(e) => setDocked(e.target.checked)} />
          Dock Mini with Computer Dynamics
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={startWithCd} onChange={(e) => setStartWithCd(e.target.checked)} />
          Start Mini when CD starts (<code className="rounded bg-white px-1">start.bat</code>)
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Mini install folder</span>
          <input
            value={installPath}
            onChange={(e) => setInstallPath(e.target.value)}
            className={inputClass}
            placeholder="E:\Mini 2026"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Local Mini URL (CD proxy)</span>
            <input
              value={localUrl}
              onChange={(e) => setLocalUrl(e.target.value)}
              className={inputClass}
              placeholder="http://127.0.0.1:8876"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Public Mini URL (Cloudflare)</span>
            <input
              value={publicUrl}
              onChange={(e) => setPublicUrl(e.target.value)}
              className={inputClass}
              placeholder="https://mini.computerdynamicstt.com"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={!!saving}
            className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
          >
            {saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Save Mini dock
          </button>
          <button
            type="button"
            onClick={testConnection}
            disabled={!!saving || !installPath.trim()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving === 'test' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Test connection
          </button>
          <button
            type="button"
            onClick={regenerateToken}
            disabled={!!saving || !installPath.trim()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Regenerate API token
          </button>
        </div>
      </form>
    </div>
  );
}
