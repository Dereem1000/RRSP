'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, FileText, Loader2, Lock } from 'lucide-react';
import { DeliverableMarkdownBody } from '@/components/deliverables/DeliverableMarkdownBody';
import { DigitalLicenseCard } from '@/components/deliverables/DigitalLicenseCard';
import type { DigitalLicenseCertificate } from '@/lib/digital-license-shared';

type DeliverableRow = {
  feature: string;
  title: string;
  markdown: string;
  sentAt?: string;
  digitalLicense?: DigitalLicenseCertificate;
};

export function DeliverablesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deliverables, setDeliverables] = useState<DeliverableRow[]>([]);
  const [activeFeature, setActiveFeature] = useState<string | null>(null);
  const [contentTab, setContentTab] = useState<'deliverable' | 'license'>('deliverable');
  const [serialsRevealed, setSerialsRevealed] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/client-portal/deliverables', { credentials: 'include' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load deliverables');
      setDeliverables(data.deliverables || []);
      setSerialsRevealed(Boolean(data.serialsRevealed));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deliverables.length) {
      setActiveFeature(null);
      return;
    }
    const fromUrl = searchParams?.get('feature')?.trim();
    if (fromUrl && deliverables.some((d) => d.feature === fromUrl)) {
      setActiveFeature(fromUrl);
      return;
    }
    setActiveFeature((current) =>
      current && deliverables.some((d) => d.feature === current)
        ? current
        : deliverables[0]!.feature,
    );
  }, [deliverables, searchParams]);

  const activeDeliverable = useMemo(
    () => deliverables.find((d) => d.feature === activeFeature) ?? null,
    [deliverables, activeFeature],
  );

  function selectPlatform(feature: string) {
    setActiveFeature(feature);
    setContentTab('deliverable');
    const params = new URLSearchParams(searchParams?.toString() || '');
    params.set('feature', feature);
    router.replace(`/deliverables?${params.toString()}`, { scroll: false });
  }

  async function unlockSerials(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError('');
    try {
      const res = await fetch('/api/client-portal/deliverables', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          feature: activeFeature ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUnlockError(data.message || 'Could not verify password');
        return;
      }
      setDeliverables(data.deliverables || []);
      setSerialsRevealed(Boolean(data.serialsRevealed));
      setPassword('');
    } catch {
      setUnlockError('Could not verify password');
    } finally {
      setUnlocking(false);
    }
  }

  function hideSerials() {
    setPassword('');
    setUnlockError('');
    setSerialsRevealed(false);
    void load();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading web platform deliverables…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
        <button type="button" onClick={() => void load()} className="ml-3 font-semibold underline">
          Retry
        </button>
      </div>
    );
  }

  if (!deliverables.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
        <FileText className="mx-auto h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-700">No platform deliveries published yet</p>
        <p className="mt-1 text-sm text-slate-500">
          When Computer Dynamics publishes a platform delivery record for your account, it will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {deliverables.length > 1 && (
        <div
          className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-1"
          role="tablist"
          aria-label="Published deliverables"
        >
          {deliverables.map((item) => {
            const isActive = item.feature === activeFeature;
            return (
              <button
                key={item.feature}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => selectPlatform(item.feature)}
                className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition ${
                  isActive
                    ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                <span className="max-w-[12rem] truncate">{item.title}</span>
              </button>
            );
          })}
        </div>
      )}

      {activeDeliverable && (
        <article className="rounded-2xl border border-slate-200 bg-white shadow-sm" role="tabpanel">
          <div className="p-6">
            <header className="mb-4 border-b border-slate-100 pb-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{activeDeliverable.title}</h2>
                  {activeDeliverable.sentAt && (
                    <p className="mt-1 text-xs text-slate-500">
                      Published {new Date(activeDeliverable.sentAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {activeDeliverable.digitalLicense && (
                  <div className="flex rounded-lg border border-slate-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => setContentTab('deliverable')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        contentTab === 'deliverable'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Delivery record
                    </button>
                    <button
                      type="button"
                      onClick={() => setContentTab('license')}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        contentTab === 'license'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      Digital license
                    </button>
                  </div>
                )}
              </div>
            </header>

            {contentTab === 'license' && activeDeliverable.digitalLicense ? (
              <div className="space-y-4">
                {serialsRevealed ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={hideSerials}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                      Hide serial numbers
                    </button>
                  </div>
                ) : (
                  <form
                    onSubmit={unlockSerials}
                    className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4"
                  >
                    <p className="text-sm font-medium text-slate-800">View license serial numbers</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Re-enter your portal password to show full serials on the digital license
                      certificate.
                    </p>
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <input
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          placeholder="Portal password"
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={unlocking || !password}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {unlocking ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Lock className="h-4 w-4" />
                        )}
                        Unlock
                      </button>
                    </div>
                    {unlockError && <p className="mt-2 text-xs text-red-600">{unlockError}</p>}
                  </form>
                )}
                <DigitalLicenseCard
                  license={activeDeliverable.digitalLicense}
                  serialsRevealed={serialsRevealed}
                />
              </div>
            ) : (
              <DeliverableMarkdownBody markdown={activeDeliverable.markdown} className="py-1" />
            )}
          </div>
        </article>
      )}
    </div>
  );
}
