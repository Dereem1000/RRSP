'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  Mail,
  RefreshCw,
  Shield,
  Zap,
  ExternalLink,
} from 'lucide-react';
import {
  ACTIVATION_FEATURE_LABELS,
  getActivationFeatures,
  type ActivationFeature,
} from '@/lib/license-constants';
import {
  LicenseSerialUnlockPanel,
  useLicenseSerialReveal,
} from '@/components/licenses/LicenseSerialUnlockPanel';

type FeatureStatus = {
  hasLicense: boolean;
  isActive: boolean;
  serialNumber?: string;
  licenseId?: number;
  expirationDate?: string | null;
  licenseType?: string;
};

type LicenseStatusResponse = {
  success: boolean;
  message?: string;
  licenseStatus?: string;
  overallStatus?: string;
  hasLicense?: boolean;
  dbAvailable?: boolean;
  dbPath?: string;
  source?: string;
  activationFeatures?: ActivationFeature[];
  featureLicenseStatus?: Partial<Record<ActivationFeature, FeatureStatus>>;
  serialsRevealed?: boolean;
};

export function ClientLicensePanel({
  clientId,
  features,
  isAdmin,
  isStaff = false,
  forceShow = false,
}: {
  clientId: string;
  features?: unknown;
  isAdmin: boolean;
  isStaff?: boolean;
  forceShow?: boolean;
}) {
  const [data, setData] = useState<LicenseStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const serialReveal = useLicenseSerialReveal();

  const activationFeatures = getActivationFeatures(features);
  const showPanel = forceShow || activationFeatures.length > 0;
  const canRevealSerials = isAdmin || isStaff;

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/msp/license-status/${clientId}`, {
        headers: serialReveal.authHeaders(),
        credentials: 'include',
      });
      const json = (await res.json()) as LicenseStatusResponse;
      if (!res.ok) throw new Error(json.message || 'Failed to load license status');
      setData(json);
      if (typeof json.serialsRevealed === 'boolean') {
        serialReveal.setRevealed(json.serialsRevealed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load license status');
    } finally {
      setLoading(false);
    }
  }, [clientId, serialReveal.authHeaders, serialReveal.setRevealed]);

  useEffect(() => {
    if (showPanel) loadStatus();
    else setLoading(false);
  }, [showPanel, loadStatus]);

  async function syncLicenses() {
    setAction('sync');
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/msp/sync/${clientId}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Sync failed');
      setMessage(json.message || 'Licenses synced to activation system');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setAction('');
    }
  }

  async function activateLicense(licenseId: number) {
    setAction(`activate-${licenseId}`);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/msp/sync/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Activation failed');
      setMessage('License activated');
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setAction('');
    }
  }

  async function sendLicensesEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!canRevealSerials || !emailPassword) return;
    setEmailSending(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/msp/clients/${clientId}/licenses/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ password: emailPassword }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Failed to send email');
      setMessage(json.message || 'License details emailed to client');
      setEmailPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  }

  async function handleUnlock(password: string) {
    const ok = await serialReveal.unlock(password);
    if (ok) await loadStatus();
  }

  async function handleLock() {
    await serialReveal.lock();
    await loadStatus();
  }

  if (!showPanel) return null;

  const licensedFeatures = data?.activationFeatures ?? activationFeatures;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="font-semibold text-slate-900">License activation</h2>
            <p className="text-xs text-slate-500">
              Live from license system database (source of truth)
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadStatus}
            disabled={loading || !!action}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={syncLicenses}
              disabled={loading || !!action}
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {action === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Push to license system
            </button>
          )}
        </div>
      </div>

      {canRevealSerials && (
        <LicenseSerialUnlockPanel
          revealed={serialReveal.revealed}
          unlocking={serialReveal.unlocking}
          error={serialReveal.error}
          onUnlock={handleUnlock}
          onLock={handleLock}
        />
      )}

      {canRevealSerials && licensedFeatures.length > 0 && (
        <form onSubmit={sendLicensesEmail} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-sm font-medium text-slate-800">Email licenses to client</p>
          <p className="mt-1 text-xs text-slate-500">
            Sends full license serials to the client&apos;s email on file. Requires your password.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              placeholder="Your password to confirm"
              autoComplete="current-password"
              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={emailSending || !emailPassword}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send to client
            </button>
          </div>
        </form>
      )}

      {(error || message) && (
        <div className={`mt-4 rounded-xl px-3 py-2 text-sm ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {loading && !data ? (
        <div className="mt-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading license system…
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge status={data?.licenseStatus ?? 'Unknown'} overall={data?.overallStatus} />
            {data?.dbAvailable === false && (
              <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                License DB unavailable
              </span>
            )}
          </div>

          {licensedFeatures.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">
              No licenses in the activation system for this client. Save the client, then use Push to license system — or
              register licenses in the activation GUI.
            </p>
          ) : (
            <ul className="mt-4 space-y-2">
              {licensedFeatures.map((feature) => {
                const status = data?.featureLicenseStatus?.[feature];
                const active = status?.isActive;
                const pending = status?.hasLicense && !status.isActive;
                return (
                  <li
                    key={feature}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        {ACTIVATION_FEATURE_LABELS[feature].title}
                      </p>
                      {status?.hasLicense && (
                        <p className="truncate text-xs text-slate-500">
                          {serialReveal.revealed && status.serialNumber
                            ? status.serialNumber
                            : 'Serial hidden — unlock to view'}
                        </p>
                      )}
                      <p className="text-xs text-slate-400">
                        {status?.licenseType && <span className="capitalize">{status.licenseType}</span>}
                        {status?.expirationDate
                          ? ` · Expires ${String(status.expirationDate).slice(0, 10)}`
                          : status?.hasLicense
                            ? ' · No expiry set'
                            : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          active
                            ? 'bg-emerald-50 text-emerald-700'
                            : pending
                              ? 'bg-amber-50 text-amber-800'
                              : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {active ? (
                          <>
                            <CheckCircle2 className="h-3 w-3" />
                            Active
                          </>
                        ) : pending ? (
                          <>
                            <AlertCircle className="h-3 w-3" />
                            Pending
                          </>
                        ) : (
                          'Not synced'
                        )}
                      </span>
                      {isAdmin && pending && status?.licenseId && (
                        <button
                          type="button"
                          onClick={() => activateLicense(status.licenseId!)}
                          disabled={!!action}
                          className="rounded-lg bg-amber-700 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-60"
                        >
                          {action === `activate-${status.licenseId}` ? '…' : 'Activate'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {data?.dbPath && data.dbAvailable === false && isAdmin && (
            <p className="mt-3 text-xs text-slate-500">
              Set <code className="rounded bg-slate-100 px-1">LICENSE_DB_PATH</code> in .env to: {data.dbPath}
            </p>
          )}
        </>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Status is read directly from <code className="rounded bg-slate-100 px-1">license_system.db</code>. The license
        API server (port 5001) is only required for external apps validating licenses at runtime.{' '}
        <Link href="/msp" className="inline-flex items-center gap-0.5 text-indigo-600 hover:underline">
          MSP dashboard
          <ExternalLink className="h-3 w-3" />
        </Link>
      </p>
    </section>
  );
}

function StatusBadge({ status, overall }: { status: string; overall?: string }) {
  const styles =
    overall === 'Active' || status === 'Active'
      ? 'bg-emerald-50 text-emerald-700'
      : overall === 'Partial' || status === 'Partially active'
        ? 'bg-blue-50 text-blue-700'
        : status === 'Pending' || overall === 'Pending'
          ? 'bg-amber-50 text-amber-800'
          : status === 'Database Unavailable' || overall === 'Unavailable'
            ? 'bg-red-50 text-red-700'
            : 'bg-slate-100 text-slate-600';

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${styles}`}>
      {overall === 'Active' || status === 'Active' ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <AlertCircle className="h-3.5 w-3.5" />
      )}
      {status}
    </span>
  );
}
