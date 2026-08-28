'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Mail, RefreshCw, Save, XCircle } from 'lucide-react';
import type { EmailLogEntry } from '@/lib/email-log';

type EmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyWebsite: string;
  confirmBeforeClientEmail: boolean;
};

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
      <span>
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-slate-500">{description}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 rounded border-slate-300 text-indigo-600"
      />
    </label>
  );
}

function formatLogTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    invoice: 'Invoice',
    quote: 'Quote',
    ticket: 'Ticket',
    welcome: 'Welcome',
    order: 'Order',
    test: 'Test',
    system: 'System',
    other: 'Other',
  };
  return labels[category] ?? category;
}

type Props = {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

export function SettingsEmailSection({ onMessage, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [email, setEmail] = useState<EmailSettings | null>(null);
  const [logs, setLogs] = useState<EmailLogEntry[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsPages, setLogsPages] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    onError('');
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load email settings');
      setEmail(data.email);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load email settings');
    } finally {
      setLoading(false);
    }
  }, [onError]);

  const loadLogs = useCallback(
    async (page = 1) => {
      setLogsLoading(true);
      try {
        const res = await fetch(`/api/settings/email/logs?page=${page}&limit=25`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load email logs');
        setLogs(data.logs ?? []);
        setLogsPage(data.pagination?.page ?? page);
        setLogsPages(data.pagination?.pages ?? 1);
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Failed to load email logs');
      } finally {
        setLogsLoading(false);
      }
    },
    [onError]
  );

  useEffect(() => {
    loadSettings();
    loadLogs();
  }, [loadSettings, loadLogs]);

  async function saveEmail(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setSaving('email');
    onMessage('');
    onError('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      onMessage('Email settings saved');
      await loadSettings();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving('');
    }
  }

  async function sendTestEmail() {
    if (!testEmail.trim()) {
      onError('Enter a test email address');
      return;
    }
    setSaving('test');
    onError('');
    onMessage('');
    try {
      const res = await fetch('/api/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: testEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Test email failed');
      onMessage(data.message || 'Test email sent');
      await loadLogs(1);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Test email failed');
    } finally {
      setSaving('');
    }
  }

  if (loading || !email) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading email settings…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <form onSubmit={saveEmail} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Mail className="h-5 w-5 text-indigo-600" />
          <h2 className="font-semibold text-slate-900">Email (SMTP)</h2>
        </div>

        <Toggle
          label="Enable email"
          checked={email.enabled}
          onChange={(v) => setEmail({ ...email, enabled: v })}
        />

        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Client emails</p>
          <Toggle
            label="Ask before sending to clients"
            description="When enabled, invoice, quote, payment, and welcome actions prompt you before an email is sent. When disabled, emails send automatically when the action requests it."
            checked={email.confirmBeforeClientEmail}
            onChange={(v) => setEmail({ ...email, confirmBeforeClientEmail: v })}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">SMTP host</span>
            <input value={email.host} onChange={(e) => setEmail({ ...email, host: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Port</span>
            <input
              type="number"
              value={email.port}
              onChange={(e) => setEmail({ ...email, port: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={email.secure}
              onChange={(e) => setEmail({ ...email, secure: e.target.checked })}
            />
            Use TLS/SSL
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Username</span>
            <input value={email.user} onChange={(e) => setEmail({ ...email, user: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Password</span>
            <input
              type="password"
              placeholder={email.password === '********' ? '••••••••' : ''}
              onChange={(e) => setEmail({ ...email, password: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">From name</span>
            <input value={email.fromName} onChange={(e) => setEmail({ ...email, fromName: e.target.value })} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">From email</span>
            <input value={email.fromEmail} onChange={(e) => setEmail({ ...email, fromEmail: e.target.value })} className={inputClass} />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving === 'email'}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving === 'email' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save email
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-4">
          <label className="block min-w-[12rem] flex-1">
            <span className="mb-1 block text-sm font-medium text-slate-700">Test recipient</span>
            <input
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="admin@example.com"
              className={inputClass}
            />
          </label>
          <p className="w-full text-xs text-slate-500">
            Sends every email template with sample data in <strong>4 bundled emails</strong> so your mail server is less likely to flag rapid bulk sending.
          </p>
          <button
            type="button"
            onClick={sendTestEmail}
            disabled={saving === 'test'}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Send template test emails
          </button>
        </div>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Sent email log</h2>
            <p className="mt-0.5 text-sm text-slate-500">All emails sent from the system</p>
          </div>
          <button
            type="button"
            onClick={() => loadLogs(logsPage)}
            disabled={logsLoading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${logsLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          {logsLoading && logs.length === 0 ? (
            <div className="flex items-center justify-center px-4 py-12 text-sm text-slate-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading email log…
            </div>
          ) : logs.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-slate-500">No emails logged yet</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">To</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatLogTime(log.createdAt)}</td>
                      <td className="px-4 py-3 text-slate-900">{log.toEmail}</td>
                      <td className="max-w-xs truncate px-4 py-3 text-slate-700" title={log.subject}>
                        {log.subject}
                        {log.detail && <span className="ml-1 text-xs text-slate-400">({log.detail})</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{categoryLabel(log.category)}</td>
                      <td className="px-4 py-3">
                        {log.status === 'sent' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Sent
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 text-red-700"
                            title={log.errorMessage ?? undefined}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Failed
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {logsPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => loadLogs(logsPage - 1)}
              disabled={logsPage <= 1 || logsLoading}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-slate-500">
              Page {logsPage} of {logsPages}
            </span>
            <button
              type="button"
              onClick={() => loadLogs(logsPage + 1)}
              disabled={logsPage >= logsPages || logsLoading}
              className="rounded-lg border border-slate-200 px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
