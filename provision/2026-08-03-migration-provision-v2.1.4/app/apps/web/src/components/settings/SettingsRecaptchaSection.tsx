'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Save, ShieldCheck } from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

type RecaptchaSettings = {
  enabled: boolean;
  siteKey: string;
  secretConfigured: boolean;
};

export function SettingsRecaptchaSection({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<RecaptchaSettings | null>(null);
  const [siteKey, setSiteKey] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const res = await fetch('/api/settings/recaptcha');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load CAPTCHA settings');
      setSettings(data.settings);
      setSiteKey(data.settings.siteKey ?? '');
      setEnabled(Boolean(data.settings.enabled));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load CAPTCHA settings');
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
      const res = await fetch('/api/settings/recaptcha', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          siteKey,
          secretKey: secretKey.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      setSettings(data.settings);
      setSecretKey('');
      onMessage(data.message || 'CAPTCHA settings saved');
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
        Loading CAPTCHA settings…
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/40 p-4">
      <div className="flex items-start gap-2">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-sky-700" />
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Google reCAPTCHA (public forms)</h4>
          <p className="mt-1 text-xs text-slate-600">
            Protects login, client registration, demo requests, technician requests, and other public
            submit buttons from bots. Uses Google reCAPTCHA v2 checkbox keys (same as v1 CDynamics).
          </p>
        </div>
      </div>

      <form onSubmit={save} className="mt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded border-slate-300 text-indigo-600"
          />
          Require CAPTCHA on public forms
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Site key</span>
          <input value={siteKey} onChange={(e) => setSiteKey(e.target.value)} className={inputClass} />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Secret key</span>
          <input
            type="password"
            value={secretKey}
            onChange={(e) => setSecretKey(e.target.value)}
            placeholder={settings?.secretConfigured ? 'Leave blank to keep current secret' : 'Paste secret key'}
            className={inputClass}
            autoComplete="off"
          />
        </label>

        <p className="text-xs text-slate-500">
          Status:{' '}
          {settings?.secretConfigured
            ? 'Secret configured'
            : 'Secret not configured — CAPTCHA will not enforce until secret is saved'}
        </p>

        <p className="text-xs text-slate-500">
          Local dev on <code className="rounded bg-slate-100 px-1">localhost</code> or{' '}
          <code className="rounded bg-slate-100 px-1">127.0.0.1</code> uses Google&apos;s test keys
          automatically. For production, add <code className="rounded bg-slate-100 px-1">localhost</code>,{' '}
          <code className="rounded bg-slate-100 px-1">127.0.0.1</code>, and your live domain under
          Domains in Google reCAPTCHA admin.
        </p>

        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save CAPTCHA settings
        </button>
      </form>
    </div>
  );
}
