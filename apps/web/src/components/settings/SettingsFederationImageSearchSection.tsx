'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ImageIcon, Loader2, Save } from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

type FederationImageSearchProvider = 'google' | 'brave';

type FederationImageSearchSettings = {
  provider: FederationImageSearchProvider;
  apiKeyConfigured: boolean;
  apiKeySource: 'database' | 'environment' | 'none';
  searchEngineId: string;
  searchEngineIdSource: 'database' | 'environment' | 'none';
  braveApiKeyConfigured: boolean;
  braveApiKeySource: 'database' | 'environment' | 'none';
  envOverride: boolean;
  ready: boolean;
};

export function SettingsFederationImageSearchSection({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<FederationImageSearchSettings | null>(null);
  const [provider, setProvider] = useState<FederationImageSearchProvider>('brave');
  const [apiKey, setApiKey] = useState('');
  const [searchEngineId, setSearchEngineId] = useState('');
  const [braveApiKey, setBraveApiKey] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const res = await fetch('/api/settings/federation-image-search');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load federation image search settings');
      setSettings(data.settings);
      setProvider(data.settings.provider === 'google' ? 'google' : 'brave');
      setSearchEngineId(data.settings.searchEngineId ?? '');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load federation image search settings');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError('');
    onMessage('');
    try {
      const res = await fetch('/api/settings/federation-image-search', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          searchEngineId: provider === 'google' ? searchEngineId : undefined,
          apiKey: provider === 'google' ? apiKey.trim() || undefined : undefined,
          braveApiKey: provider === 'brave' ? braveApiKey.trim() || undefined : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      setSettings(data.settings);
      setApiKey('');
      setBraveApiKey('');
      onMessage(data.message || 'Federation image search settings saved');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading federation image search settings…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
      <div className="flex items-start gap-2">
        <ImageIcon className="mt-0.5 h-5 w-5 text-violet-700" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Federation image search</h4>
          <p className="mt-1 text-xs text-slate-600">
            Powers the federation catalog and canonical product image picker. Choose Google (same as POS
            Inventory) or Brave Search API (subscription token only — no Search Engine ID).
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-4 space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as FederationImageSearchProvider)}
            className={inputClass}
          >
            <option value="brave">Brave Search API</option>
            <option value="google">Google Custom Search</option>
          </select>
        </label>

        {provider === 'brave' ? (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Brave subscription token</span>
            <input
              type="password"
              value={braveApiKey}
              onChange={(e) => setBraveApiKey(e.target.value)}
              placeholder={
                settings?.braveApiKeyConfigured
                  ? 'Leave blank to keep current token'
                  : 'Paste token from Brave Search API dashboard'
              }
              className={inputClass}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-slate-500">
              From{' '}
              <a
                href="https://api-dashboard.search.brave.com/"
                className="text-violet-800 underline"
                target="_blank"
                rel="noreferrer"
              >
                Brave Search API
              </a>
              . Enable Image Search on your plan.
            </p>
          </label>
        ) : (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Google API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  settings?.apiKeyConfigured ? 'Leave blank to keep current API key' : 'Paste Google API key'
                }
                className={inputClass}
                autoComplete="off"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-700">Search Engine ID (cx)</span>
              <input
                value={searchEngineId}
                onChange={(e) => setSearchEngineId(e.target.value)}
                placeholder="Programmable Search Engine ID"
                className={inputClass}
                autoComplete="off"
              />
              <p className="mt-1 text-xs text-slate-500">
                From{' '}
                <a
                  href="https://programmablesearchengine.google.com/controlpanel/all"
                  className="text-violet-800 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  Programmable Search Engine
                </a>{' '}
                → Setup. Not a Firebase project UUID.
              </p>
            </label>
          </>
        )}

        <p className="text-xs text-slate-500">
          Status:{' '}
          {settings?.ready
            ? `Ready (${settings.provider === 'brave' ? 'Brave' : 'Google'})`
            : provider === 'brave'
              ? 'Not configured — save your Brave subscription token'
              : 'Not configured — save Google API key and Search Engine ID'}
          {settings?.envOverride ? ' (server env vars may also apply)' : ''}
        </p>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save federation image search
        </button>
      </form>
    </div>
  );
}
