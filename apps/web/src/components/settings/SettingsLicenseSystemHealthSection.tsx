'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Server } from 'lucide-react';

type LicenseHealth = {
  status: string;
  latencyMs: number | null;
  lastCheck: string | null;
  message?: string;
  baseUrl?: string;
  dbAvailable?: boolean;
  licenseCount?: number;
  activeLicenseCount?: number;
  companyCount?: number;
  events24h?: { integrity: number; suspicious: number; mismatch: number; apiOffline: number };
};

function formatLicenseLastCheck(value: string | null | undefined): string {
  if (!value || value === 'Never' || value === 'null') return 'Not checked yet';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not checked yet';
  return d.toLocaleString();
}

export function SettingsLicenseSystemHealthSection() {
  const [license, setLicense] = useState<LicenseHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/security/threat-metrics');
      const data = await res.json();
      if (res.ok) setLicense(data.metrics?.license ?? null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(true), 60_000);
    return () => clearInterval(id);
  }, [load]);

  if (loading && !license) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
        Loading license system status…
      </div>
    );
  }

  if (!license) return null;

  const apiStatus = license.status ?? 'unknown';
  const apiOnline = apiStatus === 'online';

  return (
    <section
      className={`rounded-2xl border p-4 ${
        apiOnline
          ? 'border-indigo-200 bg-indigo-50/40'
          : apiStatus === 'unknown'
            ? 'border-slate-200 bg-slate-50/60'
            : 'border-red-200 bg-red-50/40'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5 text-indigo-600" />
          <h3 className="text-sm font-semibold text-slate-800">License system</h3>
        </div>
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Refresh
        </button>
      </div>

      <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
        <p>
          API: <strong className="capitalize">{apiStatus}</strong>
          {license.latencyMs != null && license.latencyMs > 0 && ` (${license.latencyMs}ms)`}
        </p>
        <p>
          DB:{' '}
          {license.dbAvailable ? (
            <>
              {license.companyCount ?? 0} {license.companyCount === 1 ? 'company' : 'companies'} ·{' '}
              {license.activeLicenseCount ?? 0} active / {license.licenseCount ?? 0} license rows
            </>
          ) : (
            'unavailable'
          )}
        </p>
        <p>
          Events (24h): integrity {license.events24h?.integrity ?? 0}, suspicious{' '}
          {license.events24h?.suspicious ?? 0}
        </p>
        <p className="text-xs text-slate-500">Last check: {formatLicenseLastCheck(license.lastCheck)}</p>
      </div>

      {!apiOnline && license.message && apiStatus !== 'unknown' && (
        <p className="mt-2 text-xs text-red-700">{license.message}</p>
      )}

      {license.baseUrl && (
        <p className="mt-1 text-xs text-slate-400">Health URL: {license.baseUrl}/health</p>
      )}

      <p className="mt-2 text-xs text-slate-500">
        Counts are rows in <code className="rounded bg-white/80 px-1">license_system.db</code>, not MSP clients
        with activation features. API serves POS, restaurant, and other products at runtime.
      </p>
    </section>
  );
}
