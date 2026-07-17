'use client';

import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { mapClientToPickerOption, type ClientPickerOption } from '@/lib/client-picker';
import { ClientFormFields, formDataToClientPayload } from './ClientFormFields';

export function CreateClientModal({
  onClose,
  defaults,
  onCreated,
  nested = false,
}: {
  onClose: () => void;
  defaults?: Record<string, string>;
  onCreated?: (client: ClientPickerOption) => void;
  /** Raise z-index when opened above another modal. */
  nested?: boolean;
}) {
  const router = useRouter();
  const { askToEmailClient } = useClientEmailPolicy();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const payload = formDataToClientPayload(form);
    const sendWelcomeEmail = payload.createPortalAccount
      ? askToEmailClient('Send a welcome email to this client with portal login details?')
      : false;

    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, sendWelcomeEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create client');
      if (data.portalCredentials) {
        if (data.portalCredentials.emailSent) {
          alert('Client created and welcome email sent.');
        } else {
          alert(
            `Client created. Welcome email failed — share credentials manually.\nUsername: ${data.portalCredentials.username}\nTemp password: ${data.portalCredentials.tempPassword}`
          );
        }
      }
      if (onCreated) {
        onCreated(mapClientToPickerOption(data.client));
        onClose();
      } else {
        onClose();
        router.push(`/clients/${data.client.id}`);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create client');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm ${
        nested ? 'z-[60]' : 'z-50'
      }`}
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl lg:max-h-none">
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3">
          <h2 className="text-lg font-semibold text-slate-900">Add client</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-4 lg:overflow-visible">
          <ClientFormFields
            key={defaults ? JSON.stringify(defaults) : 'new'}
            layout="wide"
            showContract
            showUsage
            showPortalOption
            defaults={defaults}
          />

          {error && <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}

          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-w-[10rem] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create client
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
