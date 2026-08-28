'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, Shield } from 'lucide-react';
import type { ClientPortalLicensePayload, PortalSystemLicense } from '@/lib/client-portal-license';

function statusBadgeStyle(licenseStatus: string, isActive: boolean) {
  if (isActive) return 'bg-emerald-50 text-emerald-700';
  if (licenseStatus === 'Pending' || licenseStatus === 'Partially active') return 'bg-amber-50 text-amber-800';
  if (licenseStatus === 'Not Required' || licenseStatus === 'Not Applicable') return 'bg-slate-100 text-slate-600';
  return 'bg-red-50 text-red-700';
}

function SystemLicenseBlock({ system }: { system: PortalSystemLicense }) {
  const multiple = system.licenses.length > 1;

  return (
    <li className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-900">{system.title}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
            system.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
          }`}
        >
          {system.isActive ? 'Active' : system.hasLicense ? 'Inactive' : 'Not synced'}
        </span>
      </div>

      {system.hasLicense && system.licenses.length > 0 && (
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          {system.licenses.map((lic, index) => (
            <div
              key={lic.id}
              className={multiple ? 'sm:col-span-2 rounded-lg border border-slate-200 bg-white p-3' : ''}
            >
              {multiple && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  License {index + 1}
                </p>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Serial</dt>
                  <dd className="font-mono text-sm text-slate-800">{lic.serialNumber || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Type</dt>
                  <dd className="capitalize text-slate-800">{lic.licenseType || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Max users</dt>
                  <dd className="text-slate-800">{lic.maxUsers ?? '—'}</dd>
                </div>
                {lic.expirationDate && (
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Expires</dt>
                    <dd className="text-slate-800">{String(lic.expirationDate).slice(0, 10)}</dd>
                  </div>
                )}
              </div>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

export function ClientLicenseStatusCard() {
  const [data, setData] = useState<ClientPortalLicensePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/client-portal/license-status');
      const json = await res.json();
      if (json.success) setData(json.licenseStatus);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  async function unlockDetails(e: React.FormEvent) {
    e.preventDefault();
    setUnlocking(true);
    setUnlockError('');
    try {
      const res = await fetch('/api/client-portal/license-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setUnlockError(json.message || 'Could not verify password');
        return;
      }
      setData(json.licenseStatus);
      setPassword('');
    } catch {
      setUnlockError('Could not verify password');
    } finally {
      setUnlocking(false);
    }
  }

  function hideDetails() {
    setPassword('');
    setUnlockError('');
    loadSummary();
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading license status…
        </div>
      </div>
    );
  }

  if (!data || data.licenseStatus === 'Not Applicable') return null;

  const Icon = data.isActive ? CheckCircle2 : AlertCircle;
  const badgeStyle = statusBadgeStyle(data.licenseStatus, data.isActive);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-600" />
          <h2 className="font-semibold text-slate-900">License status</h2>
        </div>
        {data.revealed ? (
          <button
            type="button"
            onClick={hideDetails}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <EyeOff className="h-3.5 w-3.5" />
            Hide details
          </button>
        ) : null}
      </div>

      {!data.revealed && data.licenseStatus !== 'Not Required' && (
        <form onSubmit={unlockDetails} className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <p className="text-sm font-medium text-slate-800">View license serial numbers</p>
          <p className="mt-1 text-xs text-slate-600">
            Re-enter your portal password to show full license details for each system.
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
              {unlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              Unlock
            </button>
          </div>
          {unlockError && <p className="mt-2 text-xs text-red-600">{unlockError}</p>}
        </form>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${badgeStyle}`}>
          <Icon className="h-3.5 w-3.5" />
          {data.licenseStatus}
        </span>
        {!data.revealed && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Lock className="h-3.5 w-3.5" />
            Serial numbers protected
          </span>
        )}
      </div>

      {data.licenseStatus === 'Not Required' ? (
        <p className="mt-3 text-sm text-slate-500">No activation features are configured for your account.</p>
      ) : (
        <>
          {(data.systems?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-3">
              {data.systems.map((system) => (
                <SystemLicenseBlock key={system.feature} system={system} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
