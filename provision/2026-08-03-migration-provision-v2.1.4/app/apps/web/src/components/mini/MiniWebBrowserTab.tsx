'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Globe2, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { apiErrorMessage, parseFetchJsonResponse } from '@/lib/parse-fetch-json';
import { useAdaptiveMiniPoll } from '@/lib/use-adaptive-mini-poll';

type WebBrowserPayload = {
  name?: string;
  kind?: string;
  status?: string;
  detail?: string;
  running?: boolean;
  control_port?: number | null;
  tab_count?: number;
  active_id?: string | null;
  tutor_tab_id?: string | null;
  tabs?: Array<{ id?: string; url?: string; title?: string }>;
  allowlist?: string[];
  captcha_paused?: boolean;
  captcha?: {
    paused?: boolean;
    reason?: string;
    url?: string;
    paused_at?: string;
  };
  toggles?: {
    address?: boolean;
    search?: boolean;
    intent?: boolean;
  };
  launch_hint?: string;
  note?: string;
  updated_at?: string;
};

type ExternalSystemsPayload = {
  web_browser?: WebBrowserPayload;
};

async function fetchBrowser(): Promise<WebBrowserPayload> {
  const res = await fetch('/api/mini/external-systems/web-browser', {
    cache: 'no-store',
    credentials: 'include',
  });
  const data = await parseFetchJsonResponse<
    ExternalSystemsPayload & { error?: string }
  >(res);
  if (!res.ok) throw new Error(apiErrorMessage(data, 'Failed to load Mini Web Browser status'));
  return data.web_browser || {};
}

async function postBrowser<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/mini/external-systems/web-browser/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await parseFetchJsonResponse<T & { error?: string; ok?: boolean }>(res);
  if (!res.ok || data.ok === false) {
    throw new Error(apiErrorMessage(data, `Request failed (${res.status})`));
  }
  return data as T;
}

export function MiniWebBrowserTab() {
  const [payload, setPayload] = useState<WebBrowserPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [pattern, setPattern] = useState('');
  const [intent, setIntent] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchBrowser();
      setPayload(data);
      setError('');
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Mini Web Browser');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const captchaPaused = Boolean(payload?.captcha_paused || payload?.captcha?.paused);

  useAdaptiveMiniPoll(true, load, {
    baseMs: captchaPaused ? 8_000 : 45_000,
    maxMs: captchaPaused ? 20_000 : 180_000,
  });

  async function run(action: () => Promise<void>, okMessage: string) {
    setBusy(true);
    setStatus('');
    setError('');
    try {
      await action();
      setStatus(okMessage);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  if (loading && !payload) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-6 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading Mini Web Browser…
      </div>
    );
  }

  const running = Boolean(payload?.running);
  const allowlist = payload?.allowlist || [];

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {status ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {status}
        </div>
      ) : null}
      {captchaPaused ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">CAPTCHA pause — Mini stopped sending browser actions</p>
          <p className="mt-1">
            Solve the challenge in the desktop Mini Web Browser window
            {payload?.captcha?.reason ? ` (${payload.captcha.reason})` : ''}. When it is gone, Mini
            resumes automatically — you should not need to click Resume. Use Show if the window is
            hidden; Resume remains as a manual override.
          </p>
          {payload?.captcha?.url ? (
            <p className="mt-1 break-all text-xs text-amber-900/80">{payload.captcha.url}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await postBrowser('launch');
                }, running ? 'Desktop browser brought forward.' : 'Desktop Mini Web Browser launched.')
              }
              className="inline-flex items-center gap-2 rounded-xl border border-amber-700 bg-white px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
            >
              <ExternalLink className="h-4 w-4" />
              Show desktop browser
            </button>
            <button
              type="button"
              disabled={busy || !running}
              onClick={() =>
                void run(async () => {
                  await postBrowser('control', { action: 'captcha_resume', actor: 'operator' });
                }, 'CAPTCHA cleared — Mini may use the browser again.')
              }
              className="inline-flex items-center gap-2 rounded-xl bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              Resume after CAPTCHA
            </button>
          </div>
        </div>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Globe2 className="h-5 w-5 text-sky-700" />
              <h2 className="text-lg font-semibold text-slate-900">Mini Web Browser</h2>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  captchaPaused
                    ? 'bg-amber-100 text-amber-900'
                    : running
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700'
                }`}
              >
                {captchaPaused ? 'captcha paused' : running ? 'running' : 'stopped'}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {payload?.note ||
                'Desktop WebView2 browser for Mini. Headless research still feeds CD chat; the desktop app handles interactive/allowlisted typing and learning.'}
            </p>
            <p className="mt-1 text-xs text-slate-500">{payload?.detail}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await postBrowser('launch');
                }, running ? 'Desktop browser brought forward.' : 'Desktop Mini Web Browser launched.')
              }
              className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              title={
                running
                  ? 'Bring the desktop Mini Web Browser window forward (works if you closed or minimized it)'
                  : 'Start the desktop Mini Web Browser'
              }
            >
              <ExternalLink className="h-4 w-4" />
              {running ? 'Show desktop browser' : 'Launch desktop browser'}
            </button>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-slate-500">Tabs</dt>
            <dd className="mt-1 font-semibold text-slate-900">{payload?.tab_count ?? 0}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-slate-500">Control port</dt>
            <dd className="mt-1 font-semibold text-slate-900">{payload?.control_port || '—'}</dd>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
            <dt className="text-slate-500">Mini toggles</dt>
            <dd className="mt-1 font-semibold text-slate-900">
              addr {payload?.toggles?.address === false ? 'off' : 'on'} · search{' '}
              {payload?.toggles?.search === false ? 'off' : 'on'} · intent{' '}
              {payload?.toggles?.intent === false ? 'off' : 'on'}
            </dd>
          </div>
        </dl>

        <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-900">Resume closed content windows</p>
          <p className="mt-1 text-xs text-slate-600">
            Research and tutor each use their own desktop window. If you closed one with the X, reopen it here
            (or use Resume research / Resume tutor in the desktop shell chrome).
            {payload?.tutor_tab_id ? ` Tutor pin: ${payload.tutor_tab_id}.` : ' Tutor pin: none.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !running}
              onClick={() =>
                void run(async () => {
                  await postBrowser('control', { action: 'ensure_research', actor: 'operator' });
                }, 'Research tab resumed or reopened.')
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              Resume research
            </button>
            <button
              type="button"
              disabled={busy || !running}
              onClick={() =>
                void run(async () => {
                  await postBrowser('control', { action: 'ensure_tutor', actor: 'operator' });
                }, 'Tutor tab resumed or reopened.')
              }
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50"
            >
              Resume tutor
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Ask Mini to type (desktop)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Sends an intent through Mini’s allowlisted desktop browser path. Headless research still runs
          automatically during chat/web_research.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="I want to learn about example code"
            className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !intent.trim()}
            onClick={() =>
              void run(async () => {
                await postBrowser('control', {
                  action: 'type_search',
                  text: intent.trim(),
                  actor: 'mini',
                });
              }, 'Sent intent to desktop Mini browser.')
            }
            className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Type as Mini
          </button>
          <button
            type="button"
            disabled={busy || !running}
            onClick={() =>
              void run(async () => {
                await postBrowser('control', { action: 'learn', actor: 'mini' });
              }, 'Learn queued from active desktop page.')
            }
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Learn active page
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-semibold text-slate-900">Allowlist for Mini</h3>
        <p className="mt-1 text-sm text-slate-600">
          You can browse anywhere in the desktop app. Mini may only open/type on these hosts.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={pattern}
            onChange={(event) => setPattern(event.target.value)}
            placeholder="chatgpt.com or *.google.com"
            className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={busy || !pattern.trim()}
            onClick={() =>
              void run(async () => {
                await postBrowser('allow/add', { pattern: pattern.trim() });
                setPattern('');
              }, `Allowed ${pattern.trim()}`)
            }
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Allow
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {allowlist.length === 0 ? (
            <p className="text-sm text-slate-500">No allowlist patterns yet.</p>
          ) : (
            allowlist.map((item) => (
              <span
                key={item}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700"
              >
                {item}
                <button
                  type="button"
                  disabled={busy}
                  title="Remove"
                  onClick={() =>
                    void run(async () => {
                      await postBrowser('allow/remove', { pattern: item });
                    }, `Removed ${item}`)
                  }
                  className="text-slate-400 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </span>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
