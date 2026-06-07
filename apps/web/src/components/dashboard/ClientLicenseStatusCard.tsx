'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Shield } from 'lucide-react';
import { ACTIVATION_FEATURE_LABELS, type ActivationFeature } from '@/lib/license-constants';

type LicenseStatus = {
  hasLicense: boolean;
  isActive: boolean;
  licenseStatus: string;
  licenseType?: string | null;
  serialNumber?: string | null;
  maxUsers?: number | null;
  features?: Record<string, boolean>;
  activationFeatures?: ActivationFeature[];
  featureLicenseStatus?: Partial<Record<ActivationFeature, { hasLicense: boolean; isActive: boolean }>>;
  activationDate?: string | null;
  expirationDate?: string | null;
  companyName?: string | null;
};

export function ClientLicenseStatusCard() {
  const [data, setData] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/client-portal/license-status')
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setData(json.licenseStatus);
      })
      .finally(() => setLoading(false));
  }, []);

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

  const badgeStyle =
    data.isActive
      ? 'bg-emerald-50 text-emerald-700'
      : data.licenseStatus === 'Pending'
        ? 'bg-amber-50 text-amber-800'
        : data.licenseStatus === 'Not Required'
          ? 'bg-slate-100 text-slate-600'
          : 'bg-red-50 text-red-700';

  const Icon = data.isActive ? CheckCircle2 : AlertCircle;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-indigo-600" />
        <h2 className="font-semibold text-slate-900">License status</h2>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${badgeStyle}`}>
          <Icon className="h-3.5 w-3.5" />
          {data.licenseStatus}
        </span>
        {data.serialNumber && (
          <span className="text-xs text-slate-500">Serial: {data.serialNumber}</span>
        )}
      </div>

      {data.licenseStatus === 'Not Required' ? (
        <p className="mt-3 text-sm text-slate-500">No activation features are configured for your account.</p>
      ) : (
        <>
          {data.licenseType && (
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">License type</dt>
                <dd className="capitalize text-slate-800">{data.licenseType}</dd>
              </div>
              {data.maxUsers != null && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Max users</dt>
                  <dd className="text-slate-800">{data.maxUsers}</dd>
                </div>
              )}
              {data.expirationDate && (
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Expires</dt>
                  <dd className="text-slate-800">{String(data.expirationDate).slice(0, 10)}</dd>
                </div>
              )}
            </dl>
          )}

          {(data.activationFeatures?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-1.5">
              {data.activationFeatures!.map((feature) => {
                const active = data.featureLicenseStatus?.[feature]?.isActive;
                return (
                  <li key={feature} className="flex items-center justify-between text-sm">
                    <span className="text-slate-700">{ACTIVATION_FEATURE_LABELS[feature].title}</span>
                    <span className={`text-xs font-medium ${active ? 'text-emerald-600' : 'text-amber-700'}`}>
                      {active ? 'Active' : 'Inactive'}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
