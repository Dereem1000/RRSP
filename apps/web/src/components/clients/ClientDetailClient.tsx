'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import { ArrowLeft, Loader2, Mail, Save, Trash2 } from 'lucide-react';
import { ClientFormFields, formDataToClientPayload } from './ClientFormFields';
import { ClientUsagePanel } from './ClientUsagePanel';
import { ClientLicensePanel } from './ClientLicensePanel';
import { ClientRelatedPanel } from './ClientRelatedPanel';
import { SERVICE_LEVEL_COLORS, STATUS_COLORS, type UsageInfo } from '@/lib/client-constants';

type Technician = { id: number; firstName: string; lastName: string };

type ClientData = {
  id: string;
  name: string;
  companyName?: string | null;
  email: string;
  phone?: string | null;
  address?: string | null;
  contactPerson?: string | null;
  serviceLevel?: string | null;
  supportTier: string;
  status: string;
  priorityLevel?: string | null;
  monthlyRate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  contractStartDate?: string | null;
  contractEndDate?: string | null;
  renewalDate?: string | null;
  notes?: string | null;
  isActive?: boolean;
  assignedTechnicianId?: string | null;
  usageTracking?: Record<string, number> | null;
  features?: string[] | null;
  servicePlanData?: Record<string, unknown>;
  userId?: number | null;
  created_at?: string;
  updated_at?: string;
  Tickets?: Array<{
    id: string;
    ticketNumber: string;
    issue: string;
    status: string;
    priority?: string | null;
    lastUpdated: string;
  }>;
};

type BillingInfo = {
  monthlyRate: number;
  billingCycle: string;
  contractStartDate: string | null;
  contractEndDate: string | null;
  renewalDate: string | null;
  nextBillingDate: string | Date | null;
  isContractActive: boolean;
};

export function ClientDetailClient({
  client: initial,
  userRole,
  technicians,
  initialUsage,
  initialBilling,
}: {
  client: ClientData;
  userRole: string;
  technicians: Technician[];
  initialUsage: UsageInfo;
  initialBilling: BillingInfo;
}) {
  const router = useRouter();
  const isAdmin = userRole === 'admin';
  const { askToEmailClient } = useClientEmailPolicy();

  const [client, setClient] = useState(initial);
  const [billing, setBilling] = useState(initialBilling);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [credentials, setCredentials] = useState<{ username: string; tempPassword: string } | null>(null);

  const formDefaults = {
    name: client.name,
    companyName: client.companyName,
    email: client.email,
    phone: client.phone,
    address: client.address,
    contactPerson: client.contactPerson,
    serviceLevel: client.serviceLevel,
    supportTier: client.supportTier,
    status: client.status,
    priorityLevel: client.priorityLevel,
    monthlyRate: client.monthlyRate,
    startDate: client.startDate,
    endDate: client.endDate,
    contractStartDate: client.contractStartDate,
    contractEndDate: client.contractEndDate,
    renewalDate: client.renewalDate,
    assignedTechnicianId: client.assignedTechnicianId,
    notes: client.notes,
    usageTracking: client.usageTracking ?? undefined,
    features: client.features ?? undefined,
    servicePlanData: client.servicePlanData,
  };

  async function saveClient(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading('save');
    setError('');
    setMessage('');
    try {
      const payload = formDataToClientPayload(new FormData(e.currentTarget));
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Update failed');
      setClient({ ...client, ...data.client });
      setMessage('Client updated');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading('');
    }
  }

  async function saveContract(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading('contract');
    setError('');
    try {
      const form = new FormData(e.currentTarget);
      const res = await fetch(`/api/clients/${client.id}/contract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractStartDate: form.get('contractStartDate'),
          contractEndDate: form.get('contractEndDate'),
          serviceLevel: form.get('serviceLevel'),
          monthlyRate: form.get('monthlyRate'),
          billingCycle: form.get('billingCycle'),
          terms: form.get('terms'),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Contract update failed');
      setClient({ ...client, ...data.client });
      const billingRes = await fetch(`/api/clients/${client.id}/billing`);
      const billingData = await billingRes.json();
      if (billingRes.ok) setBilling(billingData.billing);
      setMessage('Contract updated');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Contract update failed');
    } finally {
      setLoading('');
    }
  }

  async function deactivateClient() {
    if (!confirm('Deactivate this client?')) return;
    setLoading('delete');
    setError('');
    try {
      const res = await fetch(`/api/clients/${client.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to deactivate');
      router.push('/clients');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deactivate');
    } finally {
      setLoading('');
    }
  }

  async function forceDeleteClient() {
    if (!confirm('Permanently delete this client and all associated tickets? This cannot be undone.')) return;
    setLoading('force');
    setError('');
    try {
      const res = await fetch(`/api/clients/${client.id}?force=true`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete');
      router.push('/clients');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setLoading('');
    }
  }

  async function resendWelcome() {
    if (!askToEmailClient('Send a welcome email to this client with portal login details?')) return;
    setLoading('welcome');
    setError('');
    setCredentials(null);
    try {
      const res = await fetch(`/api/clients/${client.id}/resend-welcome`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reset portal access');
      setCredentials(data.emailSent ? null : { username: data.username, tempPassword: data.tempPassword });
      setMessage(data.message);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset portal access');
    } finally {
      setLoading('');
    }
  }

  const assignedTech = technicians.find((t) => String(t.id) === String(client.assignedTechnicianId));

  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" />
        Back to clients
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
          {client.companyName && <p className="mt-1 text-sm text-slate-500">{client.companyName}</p>}
          <p className="mt-2 text-sm text-slate-500">
            {client.email}
            {client.phone ? ` · ${client.phone}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${STATUS_COLORS[client.status] ?? 'bg-slate-100 text-slate-600'}`}>
            {client.status}
          </span>
          {client.serviceLevel && (
            <span className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${SERVICE_LEVEL_COLORS[client.serviceLevel] ?? 'bg-slate-100 text-slate-600'}`}>
              {client.serviceLevel}
            </span>
          )}
        </div>
      </div>

      {(error || message) && (
        <div className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {credentials && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-medium">Email failed — share portal credentials manually</p>
          <p className="mt-1">Username: <strong>{credentials.username}</strong></p>
          <p>Temp password: <strong>{credentials.tempPassword}</strong></p>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resendWelcome}
            disabled={loading === 'welcome'}
            className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
          >
            {loading === 'welcome' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
            Reset portal access / resend welcome
          </button>
        </div>
      )}

      {isAdmin && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Edit client</h2>
          <form
            key={`${client.updated_at}-${(client.features ?? []).join(',')}`}
            onSubmit={saveClient}
            className="mt-3 space-y-3"
          >
            <ClientFormFields
              layout="wide"
              defaults={formDefaults}
              showContract
              showUsage
              technicians={technicians}
            />
            <div className="flex flex-wrap justify-between gap-3 pt-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={deactivateClient}
                  disabled={!!loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  Deactivate
                </button>
                <button
                  type="button"
                  onClick={forceDeleteClient}
                  disabled={!!loading}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2.5 text-sm font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60"
                >
                  Force delete
                </button>
              </div>
              <button
                type="submit"
                disabled={loading === 'save'}
                className="inline-flex min-w-[10rem] items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {loading === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save changes
              </button>
            </div>
          </form>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Overview</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Contact person" value={client.contactPerson || '—'} />
            <Detail label="Support tier" value={client.supportTier} />
            <Detail label="Priority" value={client.priorityLevel ?? 'medium'} />
            <Detail label="Technician" value={assignedTech ? `${assignedTech.firstName} ${assignedTech.lastName}` : '—'} />
            <Detail label="Portal account" value={client.userId ? `Linked (user #${client.userId})` : 'None'} />
            <Detail label="Active" value={client.isActive ? 'Yes' : 'No'} />
            {client.address && (
              <div className="sm:col-span-2">
                <Detail label="Address" value={client.address} />
              </div>
            )}
          </dl>
          {client.notes && (
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
              <p className="mb-1 font-medium text-slate-900">Notes</p>
              <p className="whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Billing</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <Detail label="Monthly rate" value={billing.monthlyRate > 0 ? `TTD ${billing.monthlyRate}` : '—'} />
            <Detail label="Billing cycle" value={billing.billingCycle} />
            <Detail label="Contract active" value={billing.isContractActive ? 'Yes' : 'No'} />
            <Detail label="Next billing" value={billing.nextBillingDate ? String(billing.nextBillingDate).slice(0, 10) : '—'} />
            <Detail label="Contract start" value={billing.contractStartDate ? String(billing.contractStartDate).slice(0, 10) : '—'} />
            <Detail label="Contract end" value={billing.contractEndDate ? String(billing.contractEndDate).slice(0, 10) : '—'} />
          </dl>

          {isAdmin && (
            <form onSubmit={saveContract} className="mt-4 space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">Update contract</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input type="date" name="contractStartDate" defaultValue={String(billing.contractStartDate ?? '').slice(0, 10)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <input type="date" name="contractEndDate" defaultValue={String(billing.contractEndDate ?? '').slice(0, 10)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <select name="serviceLevel" defaultValue={client.serviceLevel ?? ''} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  <option value="">No plan</option>
                  {['basic', 'standard', 'premium', 'enterprise', 'per-job'].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input type="number" step="0.01" name="monthlyRate" defaultValue={billing.monthlyRate || ''} placeholder="Monthly rate" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                <select name="billingCycle" defaultValue={billing.billingCycle} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                  {['monthly', 'quarterly', 'annually'].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input name="terms" placeholder="Contract terms" className="rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <button type="submit" disabled={loading === 'contract'} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                {loading === 'contract' ? 'Saving…' : 'Save contract'}
              </button>
            </form>
          )}
        </section>
      </div>

      <ClientUsagePanel
        clientId={client.id}
        initialUsage={initialUsage}
        serviceLevel={client.serviceLevel}
        isAdmin={isAdmin}
      />

      <ClientLicensePanel
        clientId={client.id}
        serviceLevel={client.serviceLevel}
        isAdmin={isAdmin}
      />

      <ClientRelatedPanel clientId={client.id} tickets={client.Tickets ?? []} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 capitalize text-slate-800">{value}</dd>
    </div>
  );
}
