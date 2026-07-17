'use client';

import { ClientSearchSelect } from '@/components/clients/ClientSearchSelect';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import {
  parseClientSearchQuery,
  ticketFormDefaultsFromClient,
  type ClientPickerOption,
} from '@/lib/client-picker';
import { TicketFormFields, formDataToTicketPayload } from './TicketFormFields';

type ClientOption = ClientPickerOption;
type TechnicianOption = { id: number; firstName: string; lastName: string; username: string };

const selectClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

export function CreateTicketModal({
  clients: initialClients,
  technicians,
  clientMode = false,
  defaultClientId = '',
  canAddClient = false,
  onClose,
}: {
  clients: ClientOption[];
  technicians: TechnicianOption[];
  clientMode?: boolean;
  defaultClientId?: string;
  canAddClient?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [clientId, setClientId] = useState(defaultClientId);
  const [clientList, setClientList] = useState(initialClients);
  const [showAddClient, setShowAddClient] = useState(false);
  const [addClientDefaults, setAddClientDefaults] = useState<Record<string, string>>({});

  useEffect(() => {
    setClientList(initialClients);
  }, [initialClients]);

  useEffect(() => {
    if (defaultClientId) setClientId(defaultClientId);
  }, [defaultClientId]);

  const selectedClient = useMemo(
    () => clientList.find((c) => c.id === clientId),
    [clientList, clientId]
  );

  const fieldDefaults = useMemo(
    () => ticketFormDefaultsFromClient(selectedClient),
    [selectedClient]
  );

  function openAddClient(query: string) {
    const parsed = parseClientSearchQuery(query);
    setAddClientDefaults({
      name: parsed.name,
      ...(parsed.companyName ? { companyName: parsed.companyName } : {}),
    });
    setShowAddClient(true);
  }

  function handleClientCreated(client: ClientOption) {
    setClientList((prev) => {
      if (prev.some((c) => c.id === client.id)) return prev;
      return [client, ...prev];
    });
    setClientId(client.id);
    setShowAddClient(false);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    if (!clientId) {
      setError('Please select a client.');
      return;
    }

    setLoading(true);
    const payload = formDataToTicketPayload(new FormData(e.currentTarget));
    payload.clientId = clientId;

    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create ticket');
      onClose();
      router.push(`/tickets/${data.ticket.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
        <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl lg:max-h-none">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-6 py-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {clientMode ? 'Submit support request' : 'Create ticket'}
            </h2>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
          </div>

          <form
            onSubmit={handleSubmit}
            className="overflow-y-auto px-6 py-4 lg:overflow-visible"
          >
            {!clientMode && (
              <div className="mb-3 grid gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Client <span className="text-red-500">*</span>
                  </span>
                  <ClientSearchSelect
                    clients={clientList}
                    value={clientId}
                    onChange={setClientId}
                    name="clientId"
                    required
                    placeholder="Type client or company name…"
                    inputClassName={selectClass}
                    allowCreate={canAddClient}
                    onCreateRequest={openAddClient}
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Assign to</span>
                  <select name="assignedTo" className={selectClass}>
                    <option value="">Unassigned</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.firstName} {t.lastName}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <TicketFormFields
              key={clientId || 'no-client'}
              layout="wide"
              showFinancials={!clientMode}
              defaults={fieldDefaults}
            />

            {error && (
              <p className="mt-3 rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="mt-4 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex min-w-[10rem] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Create ticket
              </button>
            </div>
          </form>
        </div>
      </div>

      {showAddClient && (
        <CreateClientModal
          nested
          defaults={addClientDefaults}
          onCreated={handleClientCreated}
          onClose={() => setShowAddClient(false)}
        />
      )}
    </>
  );
}
