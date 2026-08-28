'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Building2, ImageIcon, Loader2, Save } from 'lucide-react';
import type { CompanySettings } from '@/lib/company-settings';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const DEFAULT_LOGO = '/logo.svg';

type Props = {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
};

export function SettingsCompanySection({ onMessage, onError }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    onError('');
    try {
      const res = await fetch('/api/settings/company');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load company settings');
      setCompany(data.company);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load company settings');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!company) return;
    setSaving(true);
    onMessage('');
    onError('');
    try {
      const res = await fetch('/api/settings/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Save failed');
      setCompany(data.company);
      onMessage('Company information saved');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  function onLogoFile(file: File | undefined) {
    if (!file || !company) return;
    if (!file.type.startsWith('image/')) {
      onError('Please choose an image file (PNG, JPG, SVG, etc.)');
      return;
    }
    if (file.size > 512 * 1024) {
      onError('Logo must be 512 KB or smaller');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCompany({ ...company, companyLogo: String(reader.result) });
      onMessage('Logo ready — save company information to apply');
    };
    reader.readAsDataURL(file);
  }

  function resetLogo() {
    if (!company) return;
    setCompany({ ...company, companyLogo: DEFAULT_LOGO });
    if (fileRef.current) fileRef.current.value = '';
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading company information…
      </div>
    );
  }

  if (!company) return null;

  const logoPreview =
    company.companyLogo && company.companyLogo !== DEFAULT_LOGO
      ? company.companyLogo
      : DEFAULT_LOGO;

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-5 w-5 text-indigo-600" />
        <div>
          <h2 className="font-semibold text-slate-900">Company information</h2>
          <p className="text-sm text-slate-500">
            Used on quotes, invoices, and all outgoing emails (logo and contact details)
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
        <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Logo</p>
          <div className="flex min-h-[72px] items-center justify-center rounded-lg border border-slate-200 bg-white p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoPreview} alt="Company logo" className="max-h-16 max-w-full object-contain" />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {company.companyLogo !== DEFAULT_LOGO && !company.companyLogo.startsWith('/')
              ? 'Custom logo'
              : 'Default portal logo'}
            {' · '}
            PNG or JPG recommended for email; SVG may not show in Outlook.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onLogoFile(e.target.files?.[0])}
          />
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Upload logo
            </button>
            <button
              type="button"
              onClick={resetLogo}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Use default
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Company name</span>
            <input
              value={company.companyName}
              onChange={(e) => setCompany({ ...company, companyName: e.target.value })}
              className={inputClass}
              required
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Address</span>
            <textarea
              rows={2}
              value={company.companyAddress}
              onChange={(e) => setCompany({ ...company, companyAddress: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Phone</span>
            <input
              value={company.companyPhone}
              onChange={(e) => setCompany({ ...company, companyPhone: e.target.value })}
              className={inputClass}
              placeholder="+1-868-316-8851"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Website</span>
            <input
              value={company.companyWebsite}
              onChange={(e) => setCompany({ ...company, companyWebsite: e.target.value })}
              className={inputClass}
              placeholder="https://www.computerdynamicstt.com"
            />
          </label>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-6">
        <h3 className="text-sm font-semibold text-slate-800">Documents &amp; quotes</h3>
        <p className="mt-1 text-xs text-slate-500">Defaults for quotes, invoices, and email footers</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Tax rate (%)</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={company.taxRate}
              onChange={(e) => setCompany({ ...company, taxRate: Number(e.target.value) })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Currency</span>
            <select
              value={company.currency}
              onChange={(e) => setCompany({ ...company, currency: e.target.value })}
              className={inputClass}
            >
              <option value="TTD">TTD</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Payment terms</span>
            <textarea
              rows={3}
              value={company.paymentTerms}
              onChange={(e) => setCompany({ ...company, paymentTerms: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Warranty terms</span>
            <textarea
              rows={3}
              value={company.warrantyTerms}
              onChange={(e) => setCompany({ ...company, warrantyTerms: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-slate-700">Closing message (emails)</span>
            <textarea
              rows={2}
              value={company.closingMessage}
              onChange={(e) => setCompany({ ...company, closingMessage: e.target.value })}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save company information
      </button>
    </form>
  );
}
