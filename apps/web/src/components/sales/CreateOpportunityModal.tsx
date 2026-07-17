'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Plus, X } from 'lucide-react';
import type { ClientPickerOption } from '@/lib/client-picker';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PRODUCT_LABELS, PRODUCT_TARGET_PROFILE, SALES_PRODUCTS } from '@/lib/sales-constants';

function detailsFromClient(client: ClientPickerOption) {
  return {
    companyName: client.companyName?.trim() || client.name?.trim() || '',
    contactName: client.contactPerson?.trim() || client.name?.trim() || '',
    email: client.email?.trim() || '',
    phone: client.phone?.trim() || '',
    address: client.address?.trim() || '',
  };
}

function clientSearchText(client: ClientPickerOption) {
  return [client.companyName, client.name, client.contactPerson, client.email, client.phone]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function formatClientSuggestion(client: ClientPickerOption) {
  const company = client.companyName?.trim();
  const name = client.name?.trim();
  if (company && name && company !== name) return `${company} — ${name}`;
  return company || name || 'Unnamed client';
}

const emptyForm = {
  companyName: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  pitchNotes: '',
};

type SearchField = 'companyName' | 'contactName' | 'email';

export function CreateOpportunityModal({
  clients,
  onClose,
  onCreated,
}: {
  clients: ClientPickerOption[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [product, setProduct] = useState<(typeof SALES_PRODUCTS)[number]>('document');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [activeField, setActiveField] = useState<SearchField | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

  const suggestions = useMemo(() => {
    if (!activeField) return [];
    const q = form[activeField].trim().toLowerCase();
    if (q.length < 2) return [];
    return clients.filter((c) => clientSearchText(c).includes(q)).slice(0, 6);
  }, [activeField, clients, form]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!formRef.current?.contains(e.target as Node)) setActiveField(null);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function patchField(field: SearchField, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (selectedClientId) setSelectedClientId('');
  }

  function pickClient(client: ClientPickerOption) {
    setSelectedClientId(client.id);
    setForm((prev) => ({ ...prev, ...detailsFromClient(client) }));
    setActiveField(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          product,
          pitchNotes: form.pitchNotes || null,
          clientId: selectedClientId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create opportunity');
      onCreated(data.opportunity.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create opportunity');
    } finally {
      setLoading(false);
    }
  }

  function renderSearchField(
    field: SearchField,
    label: string,
    opts: { required?: boolean; type?: string; placeholder?: string }
  ) {
    const showList = activeField === field && suggestions.length > 0;
    return (
      <label className="relative block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          {label}
          {opts.required ? ' *' : ''}
        </span>
        <input
          name={field}
          type={opts.type ?? 'text'}
          required={opts.required}
          value={form[field]}
          onChange={(e) => patchField(field, e.target.value)}
          onFocus={() => setActiveField(field)}
          className={inputClass}
          placeholder={opts.placeholder}
          autoComplete="off"
        />
        {showList && (
          <ul
            className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
            role="listbox"
          >
            {suggestions.map((client) => (
              <li key={client.id}>
                <button
                  type="button"
                  role="option"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-indigo-50"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickClient(client)}
                >
                  <span className="font-medium text-slate-900">{formatClientSuggestion(client)}</span>
                  {client.email ? (
                    <span className="mt-0.5 block text-xs text-slate-500">{client.email}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
      </label>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">New sales opportunity</h2>
            <p className="text-sm text-slate-500">Stage 1 — map a cold prospect for one of your systems</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Product system *</span>
            <select
              name="product"
              required
              value={product}
              onChange={(e) => setProduct(e.target.value as (typeof SALES_PRODUCTS)[number])}
              className={inputClass}
            >
              {SALES_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {PRODUCT_LABELS[p]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">{PRODUCT_TARGET_PROFILE[product]}</p>
          </label>

          {renderSearchField('companyName', 'Business name', {
            required: true,
            placeholder: 'Type to match existing clients…',
          })}

          {renderSearchField('contactName', 'Contact name', {
            required: true,
            placeholder: 'Owner or decision maker',
          })}

          <div className="grid gap-3 sm:grid-cols-2">
            {renderSearchField('email', 'Email', {
              type: 'email',
              placeholder: 'Needed before proposal',
            })}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
              <PhoneInput value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Address</span>
            <input
              name="address"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
            <textarea
              name="pitchNotes"
              rows={2}
              value={form.pitchNotes}
              onChange={(e) => setForm((f) => ({ ...f, pitchNotes: e.target.value }))}
              className={inputClass}
              placeholder="How you found them, current pain points…"
            />
          </label>

          {selectedClientId && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Linked to an existing client — details loaded. Edit any field if needed.
            </p>
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Start guided sale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
