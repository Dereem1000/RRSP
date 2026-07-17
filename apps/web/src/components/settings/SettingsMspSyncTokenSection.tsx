'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Copy, KeyRound, Loader2, RefreshCw, Shield, UploadCloud } from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

type MspSyncSettings = {
  configured: boolean;
  effectiveSource: 'env' | 'database' | 'none';
  tokenPreview: string | null;
  mspApiUrl: string;
  envOverride: boolean;
  licenseDbSynced: boolean;
  updatedAt: string | null;
};

type MiniMspSyncSettings = {
  docked: boolean;
  miniReachable: boolean;
  portalConfigured: boolean;
  portalTokenPreview: string | null;
  portalTokenFingerprint: string | null;
  portalMspApiUrl: string;
  miniConfigured: boolean;
  miniTokenPreview: string | null;
  miniTokenFingerprint: string | null;
  miniMspApiUrl: string | null;
  inSync: boolean;
  lastSyncedAt: string | null;
  message: string;
};

export function SettingsMspSyncTokenSection({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [settings, setSettings] = useState<MspSyncSettings | null>(null);
  const [miniSync, setMiniSync] = useState<MiniMspSyncSettings | null>(null);
  const [envOverrideMessage, setEnvOverrideMessage] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState('');
  const [apiUrlInput, setApiUrlInput] = useState('');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const res = await fetch('/api/settings/msp-sync-token', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load sync token settings');
      setSettings(data.settings);
      setMiniSync(data.miniSync ?? null);
      setEnvOverrideMessage(data.envOverrideMessage ?? null);
      setApiUrlInput(data.settings?.mspApiUrl ?? '');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load sync token settings');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function generateToken() {
    if (!confirm('Generate a new sync token? The old token will stop working after you save and update clients.')) {
      return;
    }
    setSaving('generate');
    onError('');
    onMessage('');
    try {
      const res = await fetch('/api/settings/msp-sync-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ mspApiUrl: apiUrlInput.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to generate token');
      setRevealedToken(data.token ?? null);
      setTokenInput('');
      onMessage(data.message || 'New token generated');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to generate token');
    } finally {
      setSaving('');
    }
  }

  async function saveToken(e: FormEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) {
      onError('Enter a token or generate a new one');
      return;
    }
    setSaving('save');
    onError('');
    onMessage('');
    try {
      const res = await fetch('/api/settings/msp-sync-token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          token: tokenInput.trim(),
          mspApiUrl: apiUrlInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save token');
      setRevealedToken(data.token ?? null);
      setTokenInput('');
      onMessage(data.message || 'Sync token saved');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save token');
    } finally {
      setSaving('');
    }
  }

  async function syncToMini() {
    setSaving('sync-mini');
    onError('');
    onMessage('');
    try {
      const res = await fetch('/api/settings/msp-sync-token/sync-mini', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to sync token to Mini');
      setMiniSync(data.miniSync ?? null);
      onMessage(data.message || 'MSP sync token pushed to Mini');
      await load();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to sync token to Mini');
    } finally {
      setSaving('');
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      onMessage('Copied to clipboard');
    } catch {
      onError('Could not copy to clipboard');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading license sync settings…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-5 w-5 text-violet-700" />
          <div>
            <h4 className="text-sm font-semibold text-slate-900">License GUI sync token</h4>
            <p className="mt-1 text-xs text-slate-600">
              Bearer token used by the License Activation GUI and Mini Project Guard baseline tamper responses.
              Rotate here if compromised, then sync to Mini.
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
          Status:{' '}
          <strong>{settings?.configured ? 'Configured' : 'Not set'}</strong>
        </p>
        <p>
          Active source:{' '}
          <strong className="capitalize">{settings?.effectiveSource ?? 'none'}</strong>
        </p>
        <p>
          Preview: <code className="rounded bg-white px-1.5 py-0.5 text-xs">{settings?.tokenPreview ?? '—'}</code>
        </p>
        <p className="text-xs text-slate-500">
          License DB: {settings?.licenseDbSynced ? 'synced' : 'not synced'}
          {settings?.updatedAt ? ` · ${new Date(settings.updatedAt).toLocaleString()}` : ''}
        </p>
        <p>
          Mini sync:{' '}
          <strong>
            {miniSync?.inSync ? 'In sync' : miniSync?.miniConfigured ? 'Out of sync' : 'Not synced'}
          </strong>
        </p>
      </div>

      {miniSync && !miniSync.inSync && settings?.configured ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <p className="font-semibold">Mini is not using the current MSP token</p>
          <p className="mt-1">{miniSync.message}</p>
          <p className="mt-2">
            Click <strong>Sync to Mini</strong> below so Project Guard can deactivate licenses when a baseline is
            tampered with.
          </p>
        </div>
      ) : null}

      {miniSync?.inSync ? (
        <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Mini license sync is current
          {miniSync.lastSyncedAt ? ` (last synced ${new Date(miniSync.lastSyncedAt).toLocaleString()})` : ''}.
        </p>
      ) : null}

      {envOverrideMessage && (
        <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {envOverrideMessage}
        </p>
      )}

      {revealedToken && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
          <p className="text-xs font-medium text-emerald-900">New token — copy now</p>
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
            Also saved to the license database for the Activation GUI. Open the GUI MSP Integration tab and click Save
            Config if it still shows an old token.
          </p>
        </div>
      )}

      <form onSubmit={saveToken} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">MSP API URL (for License GUI)</span>
          <input
            value={apiUrlInput}
            onChange={(e) => setApiUrlInput(e.target.value)}
            className={inputClass}
            placeholder="http://localhost:3000/api/msp"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Custom token (optional)</span>
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className={inputClass}
            placeholder="Paste your own token or generate below"
            autoComplete="off"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={syncToMini}
            disabled={!!saving || !settings?.configured}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
          >
            {saving === 'sync-mini' ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            Sync to Mini
          </button>
          <button
            type="button"
            onClick={generateToken}
            disabled={!!saving}
            className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {saving === 'generate' ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Generate new token
          </button>
          <button
            type="submit"
            disabled={!!saving || !tokenInput.trim()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {saving === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save custom token
          </button>
          {!miniSync?.docked ? (
            <Link
              href="/settings?tab=integrations"
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Configure Mini dock
            </Link>
          ) : null}
        </div>
      </form>
    </div>
  );
}
