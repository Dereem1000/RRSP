'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Building2,
  DatabaseBackup,
  FlaskConical,
  Loader2,
  Mail,
  Plug,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  Ticket,
  Users,
} from 'lucide-react';
import { SettingsBackupSection } from '@/components/settings/SettingsBackupSection';
import { SettingsCompanySection } from '@/components/settings/SettingsCompanySection';
import { SettingsEmailSection } from '@/components/settings/SettingsEmailSection';
import { SettingsIntegrationsSection } from '@/components/settings/SettingsIntegrationsSection';
import { SettingsSecuritySection } from '@/components/settings/SettingsSecuritySection';
import { SettingsUsersSection } from '@/components/settings/SettingsUsersSection';

type TicketSettings = {
  emailOnCreate: boolean;
  emailOnStatusChange: boolean;
  emailOnAssign: boolean;
  emailOnResolve: boolean;
  emailOnComment: boolean;
  noticesOnCreate: boolean;
  noticesOnAssign: boolean;
  noticesOnStatusChange: boolean;
  clientCanCreateTickets: boolean;
  requireServiceLevelForClientCreate: boolean;
};

type GeneralSettings = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  systemVersion: string;
  demoMode: boolean;
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

type SettingsTab = 'system' | 'email' | 'company' | 'users' | 'security' | 'integrations' | 'backup';

const VALID_TABS: SettingsTab[] = ['system', 'email', 'company', 'users', 'security', 'integrations', 'backup'];

function tabFromSearchParam(value: string | null): SettingsTab | null {
  if (value && VALID_TABS.includes(value as SettingsTab)) {
    return value as SettingsTab;
  }
  return null;
}

export function SettingsPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<SettingsTab>(() => tabFromSearchParam(searchParams?.get('tab') ?? null) ?? 'system');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [tickets, setTickets] = useState<TicketSettings | null>(null);
  const [general, setGeneral] = useState<GeneralSettings | null>(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load settings');
      setTickets(data.tickets);
      setGeneral(data.general);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const fromUrl = tabFromSearchParam(searchParams?.get('tab') ?? null);
    if (fromUrl) setTab(fromUrl);
  }, [searchParams]);

  function selectTab(next: SettingsTab) {
    setTab(next);
    router.replace(`/settings?tab=${next}`, { scroll: false });
  }

  async function saveSection(section: 'tickets' | 'general', e: FormEvent) {
    e.preventDefault();
    setSaving(section);
    setMessage('');
    setError('');
    try {
      const body = section === 'tickets' ? { tickets } : { general };
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      setMessage(
        section === 'general' && general?.demoMode === false
          ? 'Demo mode off — live database restored from snapshot.'
          : section === 'general' && general?.demoMode === true
            ? 'Demo mode on — snapshot saved. Test freely; turn demo mode off to restore live data.'
            : 'Settings saved'
      );
      if (section === 'general') await load();
      if (section === 'general') {
        router.refresh();
        window.dispatchEvent(new CustomEvent('cd-demo-mode-changed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving('');
    }
  }

  const systemReady = !loading && tickets && general;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">System settings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Tickets, portal configuration, and staff accounts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'system' && (
            <button
              type="button"
              onClick={load}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Reload
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 w-fit">
        <button
          type="button"
          onClick={() => selectTab('system')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'system' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Settings2 className="h-4 w-4" />
          System
        </button>
        <button
          type="button"
          onClick={() => selectTab('email')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'email' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Mail className="h-4 w-4" />
          Email
        </button>
        <button
          type="button"
          onClick={() => selectTab('company')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'company' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building2 className="h-4 w-4" />
          Company
        </button>
        <button
          type="button"
          onClick={() => selectTab('users')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'users' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="h-4 w-4" />
          Staff
        </button>
        <button
          type="button"
          onClick={() => selectTab('security')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'security' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Shield className="h-4 w-4" />
          Security
        </button>
        <button
          type="button"
          onClick={() => selectTab('integrations')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'integrations' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Plug className="h-4 w-4" />
          Integrations
        </button>
        <button
          type="button"
          onClick={() => selectTab('backup')}
          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'backup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <DatabaseBackup className="h-4 w-4" />
          Backup
        </button>
      </div>

      {(error || message) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
        >
          {error || message}
        </div>
      )}

      {tab === 'users' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SettingsUsersSection onMessage={setMessage} onError={setError} />
        </div>
      ) : tab === 'company' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SettingsCompanySection onMessage={setMessage} onError={setError} />
        </div>
      ) : tab === 'security' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SettingsSecuritySection onMessage={setMessage} onError={setError} />
        </div>
      ) : tab === 'integrations' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SettingsIntegrationsSection onMessage={setMessage} onError={setError} />
        </div>
      ) : tab === 'email' ? (
        <SettingsEmailSection onMessage={setMessage} onError={setError} />
      ) : tab === 'backup' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <SettingsBackupSection onMessage={setMessage} onError={setError} />
        </div>
      ) : !systemReady ? (
        <div className="flex items-center justify-center py-20 text-slate-500">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          Loading settings…
        </div>
      ) : (
      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={(e) => saveSection('tickets', e)}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="mb-4 flex items-center gap-2">
            <Ticket className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Ticket notifications</h2>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Email alerts</p>
            <Toggle label="On ticket create" checked={tickets.emailOnCreate} onChange={(v) => setTickets({ ...tickets, emailOnCreate: v })} />
            <Toggle label="On status change" checked={tickets.emailOnStatusChange} onChange={(v) => setTickets({ ...tickets, emailOnStatusChange: v })} />
            <Toggle label="On assignment" checked={tickets.emailOnAssign} onChange={(v) => setTickets({ ...tickets, emailOnAssign: v })} />
            <Toggle label="On resolve" checked={tickets.emailOnResolve} onChange={(v) => setTickets({ ...tickets, emailOnResolve: v })} />
            <Toggle label="On comment" checked={tickets.emailOnComment} onChange={(v) => setTickets({ ...tickets, emailOnComment: v })} />
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notice board</p>
            <Toggle label="Notice on create" checked={tickets.noticesOnCreate} onChange={(v) => setTickets({ ...tickets, noticesOnCreate: v })} />
            <Toggle label="Notice on assign" checked={tickets.noticesOnAssign} onChange={(v) => setTickets({ ...tickets, noticesOnAssign: v })} />
            <Toggle label="Notice on status change" checked={tickets.noticesOnStatusChange} onChange={(v) => setTickets({ ...tickets, noticesOnStatusChange: v })} />
          </div>

          <div className="mt-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Client portal</p>
            <Toggle
              label="Clients can create tickets"
              checked={tickets.clientCanCreateTickets}
              onChange={(v) => setTickets({ ...tickets, clientCanCreateTickets: v })}
            />
            <Toggle
              label="Require service level to create"
              description="Client must have an active service level before submitting tickets"
              checked={tickets.requireServiceLevelForClientCreate}
              onChange={(v) => setTickets({ ...tickets, requireServiceLevelForClientCreate: v })}
            />
          </div>

          <button
            type="submit"
            disabled={saving === 'tickets'}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving === 'tickets' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save ticket settings
          </button>
        </form>

        <form
          onSubmit={(e) => saveSection('general', e)}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:col-span-2"
        >
          <div className="mb-4 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">General</h2>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Toggle
              label="Demo mode"
              description="Creates a sandbox copy of the database. You can test payments, tickets, and edits normally — turning demo mode off discards all sandbox changes and restores live data."
              checked={general.demoMode}
              onChange={(v) => setGeneral({ ...general, demoMode: v })}
            />
            <Toggle
              label="Maintenance mode"
              description="When enabled, non-admin users see a maintenance message"
              checked={general.maintenanceMode}
              onChange={(v) => setGeneral({ ...general, maintenanceMode: v })}
            />
            <label className="block lg:col-span-2">
              <span className="mb-1 block text-sm font-medium text-slate-700">Maintenance message</span>
              <textarea
                rows={2}
                value={general.maintenanceMessage}
                onChange={(e) => setGeneral({ ...general, maintenanceMessage: e.target.value })}
                className={inputClass}
              />
            </label>
            <p className="text-sm text-slate-500 lg:col-span-2">Version: {general.systemVersion}</p>
          </div>

          {general.demoMode && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                Demo mode is <strong>on</strong>. You are working in a sandbox database — changes here are
                discarded when you turn demo mode off.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving === 'general'}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving === 'general' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save general settings
          </button>
        </form>
      </div>
      )}
    </div>
  );
}
