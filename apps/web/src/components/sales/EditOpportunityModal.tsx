'use client';

import { FormEvent, useState } from 'react';
import { Loader2, Pencil, X } from 'lucide-react';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PRODUCT_LABELS, PRODUCT_TARGET_PROFILE, SALES_PRODUCTS } from '@/lib/sales-constants';
import type { SalesProduct } from '@cd-v2/database';

export type EditableOpportunity = {
  id: string;
  companyName: string;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  product: SalesProduct;
  pitchNotes?: string | null;
};

export function EditOpportunityModal({
  opportunity,
  onClose,
  onSaved,
}: {
  opportunity: EditableOpportunity;
  onClose: () => void;
  onSaved: (opportunity: EditableOpportunity) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    companyName: opportunity.companyName,
    contactName: opportunity.contactName,
    email: opportunity.email ?? '',
    phone: opportunity.phone ?? '',
    address: opportunity.address ?? '',
    pitchNotes: opportunity.pitchNotes ?? '',
    product: opportunity.product,
  });

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/sales/${opportunity.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: form.companyName,
          contactName: form.contactName,
          email: form.email || null,
          phone: form.phone || null,
          address: form.address || null,
          product: form.product,
          pitchNotes: form.pitchNotes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save changes');

      onSaved({
        id: opportunity.id,
        companyName: data.opportunity.companyName,
        contactName: data.opportunity.contactName,
        email: data.opportunity.email,
        phone: data.opportunity.phone,
        address: data.opportunity.address,
        product: data.opportunity.product,
        pitchNotes: data.opportunity.pitchNotes,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save changes');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit prospect</h2>
            <p className="text-sm text-slate-500">Update details when you learn more about this opportunity</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Product system *</span>
            <select
              required
              value={form.product}
              onChange={(e) => setForm((f) => ({ ...f, product: e.target.value as SalesProduct }))}
              className={inputClass}
            >
              {SALES_PRODUCTS.map((p) => (
                <option key={p} value={p}>
                  {PRODUCT_LABELS[p]}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-500">{PRODUCT_TARGET_PROFILE[form.product]}</p>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Business name *</span>
            <input
              required
              value={form.companyName}
              onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Contact name *</span>
            <input
              required
              value={form.contactName}
              onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
              className={inputClass}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
              <PhoneInput value={form.phone} onChange={(phone) => setForm((f) => ({ ...f, phone }))} />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Address</span>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
            <textarea
              rows={2}
              value={form.pitchNotes}
              onChange={(e) => setForm((f) => ({ ...f, pitchNotes: e.target.value }))}
              className={inputClass}
              placeholder="How you found them, current pain points…"
            />
          </label>

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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
