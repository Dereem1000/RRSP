'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Settings, X } from 'lucide-react';
import {
  ACTIVATION_FEATURES,
  ACTIVATION_FEATURE_LABELS,
  type ActivationFeature,
} from '@/lib/license-constants';
import type { ProductCatalog, ProductCatalogEntry } from '@/lib/management-system-product-config';
import { deliverablePathForRoot } from '@/lib/product-catalog-paths';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

type Props = {
  feature: ActivationFeature | null;
  open: boolean;
  onClose: () => void;
};

export function ProductConfigModal({ feature, open, onClose }: Props) {
  const [catalog, setCatalog] = useState<ProductCatalog>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/msp/management-systems/product-config', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load config');
      setCatalog(data.catalog || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  if (!open) return null;

  const features = feature ? [feature] : ACTIVATION_FEATURES;

  function updateRow(f: ActivationFeature, patch: Partial<ProductCatalogEntry>) {
    setCatalog((prev) => {
      const current = prev[f] || { projectRoot: '', deliverableTemplatePath: '', systemKey: f };
      const next = { ...current, ...patch };
      if (patch.projectRoot !== undefined) {
        const root = patch.projectRoot.trim();
        next.deliverableTemplatePath = root ? deliverablePathForRoot(root) : '';
      }
      return { ...prev, [f]: next };
    });
  }

  async function save() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/msp/management-systems/product-config', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Save failed');
      setCatalog(data.catalog || {});
      setMessage('Product configuration saved.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function pickFolder(target: ActivationFeature) {
    setError('');
    try {
      const res = await fetch('/api/developer-toolbox/provisioning', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pick-folder' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || data.message || 'Folder picker failed');
      const path = String(data.path || data.folder || '').trim();
      if (path) {
        updateRow(target, { projectRoot: path });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Folder picker failed');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">Product provisioning config</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : (
            <div className="space-y-6">
              {features.map((f) => {
                const row = catalog[f] || { projectRoot: '', deliverableTemplatePath: '', systemKey: f };
                const label = ACTIVATION_FEATURE_LABELS[f];
                return (
                  <div key={f} className="rounded-xl border border-slate-200 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">{f}</p>
                    <h3 className="font-medium text-slate-900">{label.title}</h3>
                    <div className="mt-3 space-y-3">
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Product root</span>
                        <div className="flex gap-2">
                          <input
                            className={inputClass}
                            value={row.projectRoot}
                            onChange={(e) => updateRow(f, { projectRoot: e.target.value })}
                            placeholder="E:\POS System"
                          />
                          <button
                            type="button"
                            onClick={() => void pickFolder(f)}
                            className="shrink-0 rounded-xl border border-slate-200 px-3 text-sm hover:bg-slate-50"
                          >
                            Pick
                          </button>
                        </div>
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">Deliverable template</span>
                        <input
                          className={inputClass}
                          value={row.deliverableTemplatePath}
                          onChange={(e) => updateRow(f, { deliverableTemplatePath: e.target.value })}
                          placeholder={row.projectRoot ? deliverablePathForRoot(row.projectRoot) : 'E:\\POS System\\DELIVERABLE.md'}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          Auto-filled from product root as <code className="rounded bg-slate-100 px-1">DELIVERABLE.md</code>.
                          Override only if the template lives elsewhere.
                        </p>
                      </label>
                      <label className="block text-sm">
                        <span className="mb-1 block font-medium text-slate-700">System key (Mini)</span>
                        <input
                          className={inputClass}
                          value={row.systemKey || f}
                          onChange={(e) => updateRow(f, { systemKey: e.target.value })}
                          placeholder="pos"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm">
            Close
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
