'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import {
  ACTIVATION_FEATURE_LABELS,
  ACTIVATION_FEATURES,
  getActivationFeatures,
  type ActivationFeature,
} from '@/lib/license-constants';
import { ClientDetailNav } from './ClientDetailNav';
import { ClientLicensePanel } from './ClientLicensePanel';

type ClientData = {
  id: string;
  name: string;
  companyName?: string | null;
  features?: string[] | null;
};

export function ClientLicensesClient({
  client: initial,
  isAdmin,
  isStaff = false,
}: {
  client: ClientData;
  isAdmin: boolean;
  isStaff?: boolean;
}) {
  const router = useRouter();
  const [client, setClient] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const initialFeatures = getActivationFeatures(client.features);

  async function saveFeatures(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const form = new FormData(e.currentTarget);
      const features = form.getAll('features') as ActivationFeature[];
      const res = await fetch(`/api/clients/${client.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ features }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Update failed');
      setClient({ ...client, features: data.client?.features ?? features });
      setMessage('Activation features saved');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600">
        <ArrowLeft className="h-4 w-4" />
        Back to clients
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{client.name}</h1>
        {client.companyName && <p className="mt-1 text-sm text-slate-500">{client.companyName}</p>}
      </div>

      <ClientDetailNav clientId={client.id} />

      {(error || message) && (
        <div className={`rounded-xl px-4 py-3 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-900">Activation features</h2>
        <p className="mt-1 text-sm text-slate-500">
          Select management systems that require license activation. Save, then sync licenses below.
        </p>
        {isAdmin ? (
          <form key={(client.features ?? []).join(',')} onSubmit={saveFeatures} className="mt-4 space-y-4">
            <div className="grid gap-2 sm:grid-cols-2">
              {ACTIVATION_FEATURES.map((feature) => (
                <label
                  key={feature}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:border-indigo-200"
                >
                  <input
                    type="checkbox"
                    name="features"
                    value={feature}
                    defaultChecked={initialFeatures.includes(feature)}
                    className="mt-1 rounded border-slate-300 text-indigo-600"
                  />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">
                      {ACTIVATION_FEATURE_LABELS[feature].title}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {ACTIVATION_FEATURE_LABELS[feature].description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save features
            </button>
          </form>
        ) : (
          <ul className="mt-4 space-y-2">
            {initialFeatures.length === 0 ? (
              <li className="text-sm text-slate-500">No activation features configured.</li>
            ) : (
              initialFeatures.map((feature) => (
                <li key={feature} className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-800">
                  {ACTIVATION_FEATURE_LABELS[feature].title}
                </li>
              ))
            )}
          </ul>
        )}
      </section>

      <ClientLicensePanel
        clientId={client.id}
        features={client.features}
        isAdmin={isAdmin}
        isStaff={isStaff}
        forceShow
      />
    </div>
  );
}
