'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  KeyRound,
  Loader2,
  Power,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const disabledBtnClass =
  'cursor-not-allowed opacity-50 pointer-events-none border-slate-200 bg-slate-100 text-slate-400';

const BYPASS_DURATION_PRESETS = [
  { key: '60', label: '60 min', minutes: 60 },
  { key: '1440', label: '24 hours', minutes: 1440 },
  { key: '4320', label: '3 days', minutes: 4320 },
  { key: '10080', label: '1 week', minutes: 10080 },
  { key: '43200', label: '1 month', minutes: 43200 },
] as const;

type DurationPresetKey = (typeof BYPASS_DURATION_PRESETS)[number]['key'] | 'custom';

function resolveBypassMinutes(
  preset: DurationPresetKey,
  custom: { amount: number; unit: 'minutes' | 'hours' | 'days' },
  maxMinutes: number
): number {
  let minutes: number;
  if (preset === 'custom') {
    const amount = Math.max(1, custom.amount);
    if (custom.unit === 'days') minutes = amount * 24 * 60;
    else if (custom.unit === 'hours') minutes = amount * 60;
    else minutes = amount;
  } else {
    minutes = BYPASS_DURATION_PRESETS.find((p) => p.key === preset)?.minutes ?? 60;
  }
  return Math.min(maxMinutes, Math.max(1, minutes));
}

function formatDurationSummary(minutes: number): string {
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  if (minutes < 24 * 60) {
    const h = Math.round((minutes / 60) * 10) / 10;
    return `${h} hour${h === 1 ? '' : 's'}`;
  }
  const d = Math.round((minutes / (24 * 60)) * 10) / 10;
  return `${d} day${d === 1 ? '' : 's'}`;
}

type Platform = {
  monitoring: { enabled: boolean; threatLevel: string; eventsLast24h: number };
  worker: {
    health: 'online' | 'stale' | 'offline' | 'disabled';
    lastHeartbeat: string | null;
    version: string | null;
    checksTotal: number;
    lastError: string | null;
    intervalMs: number;
  };
  emergency: {
    isActive: boolean;
    expiresAt: string | null;
    isExpired: boolean;
  };
  recentEvents: Array<{
    id: number;
    eventType: string;
    severity: string;
    description: string;
    createdAt: string;
  }>;
  protectedFiles: number;
  securityScore: number;
  features: {
    fileIntegrity: { enabled: boolean; lastIssues24h: number };
    activityMonitor: { enabled: boolean; suspicious24h: number; failedLogins24h: number };
    intrusionDetection: { enabled: boolean; threats24h: number };
    botDetection: { enabled: boolean; bots24h: number };
    lastCycleAt: string | null;
  };
  authCodeConfigured: boolean;
  maxBypassMinutes: number;
  license?: {
    status: string;
    latencyMs: number | null;
    lastCheck: string | null;
    message?: string;
    baseUrl?: string;
    dbAvailable?: boolean;
    licenseCount?: number;
    activeLicenseCount?: number;
    events24h?: { integrity: number; suspicious: number; mismatch: number; apiOffline: number };
  };
  lastUpdated: string;
};

type IntegrityItem = { path: string; status: string; reason?: string };

type OverrideRow = {
  id: string;
  overrideType: string;
  reason: string;
  status: string;
  duration: number | null;
  createdAt: string;
};

function ThreatBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    low: 'bg-emerald-50 text-emerald-700',
    medium: 'bg-amber-50 text-amber-800',
    high: 'bg-orange-50 text-orange-800',
    critical: 'bg-red-50 text-red-700',
  };
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase ${styles[level] ?? 'bg-slate-100'}`}
    >
      {level}
    </span>
  );
}

function WorkerBadge({ health }: { health: string }) {
  const styles: Record<string, string> = {
    online: 'bg-emerald-50 text-emerald-700',
    stale: 'bg-amber-50 text-amber-800',
    offline: 'bg-red-50 text-red-700',
    disabled: 'bg-slate-100 text-slate-500',
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${styles[health] ?? ''}`}>
      Worker {health}
    </span>
  );
}

export function SettingsSecuritySection({
  onMessage,
  onError,
}: {
  onMessage: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [loading, setLoading] = useState('');
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [showActivate, setShowActivate] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [showAuthSetup, setShowAuthSetup] = useState(false);
  const [activateForm, setActivateForm] = useState({ reason: '', authorization: '' });
  const [durationPreset, setDurationPreset] = useState<DurationPresetKey>('60');
  const [customDuration, setCustomDuration] = useState<{ amount: number; unit: 'minutes' | 'hours' | 'days' }>({
    amount: 1,
    unit: 'hours',
  });
  const [disableAuth, setDisableAuth] = useState('');
  const [newAuthCode, setNewAuthCode] = useState('');
  const [integrityItems, setIntegrityItems] = useState<IntegrityItem[] | null>(null);
  const [allEvents, setAllEvents] = useState<Platform['recentEvents'] | null>(null);
  const [metrics, setMetrics] = useState<{
    intrusion: { enabled: boolean; threats24h: number; blockedIps: number; rateLimited24h: number };
    bot: { enabled: boolean; detected24h: number; blocked24h: number; captchaEnabled: boolean };
    repair: { enabled: boolean; attempted24h: number; succeeded24h: number };
    blockedIps: Array<{ ip: string; reason: string }>;
    license?: {
      status: string;
      latencyMs: number | null;
      lastCheck: string | null;
    message?: string;
      baseUrl?: string;
      dbAvailable?: boolean;
      licenseCount?: number;
      activeLicenseCount?: number;
      events24h?: { integrity: number; suspicious: number; mismatch: number; apiOffline: number };
    };
  } | null>(null);

  const loadAll = useCallback(async () => {
    setLoading('load');
    onError('');
    try {
      const [statusRes, listRes, metricsRes] = await Promise.all([
        fetch('/api/security/platform-status'),
        fetch('/api/emergency/overrides?limit=15'),
        fetch('/api/security/threat-metrics'),
      ]);
      const statusData = await statusRes.json();
      const listData = await listRes.json();
      const metricsData = await metricsRes.json();
      if (!statusRes.ok) throw new Error(statusData.message || 'Failed to load security status');
      setPlatform(statusData.platform);
      if (listRes.ok) setOverrides(listData.overrides ?? []);
      if (metricsRes.ok) setMetrics(metricsData.metrics);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load security');
    } finally {
      setLoading('');
    }
  }, [onError]);

  const refreshMonitoringStatus = useCallback(async () => {
    setLoading('reconcile');
    onError('');
    try {
      const res = await fetch('/api/security/reconcile', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to refresh monitoring status');
      setPlatform(data.platform);
      setAllEvents(null);
      onMessage(data.message || 'Monitoring status refreshed');
      const metricsRes = await fetch('/api/security/threat-metrics');
      const metricsData = await metricsRes.json();
      if (metricsRes.ok) setMetrics(metricsData.metrics);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to refresh monitoring status');
    } finally {
      setLoading('');
    }
  }, [onError, onMessage]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60_000);
    return () => clearInterval(id);
  }, [loadAll]);

  async function toggleMonitoring(enable: boolean) {
    if (!enable && !disableAuth.trim()) {
      setShowDisable(true);
      return;
    }
    setLoading('toggle');
    try {
      const res = await fetch('/api/security/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enable, authorization: disableAuth || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Update failed');
      setPlatform(data.platform);
      setShowDisable(false);
      setDisableAuth('');
      onMessage(data.message);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setLoading('');
    }
  }

  async function saveAuthCode(e: FormEvent) {
    e.preventDefault();
    setLoading('auth');
    try {
      const res = await fetch('/api/security/auth-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: newAuthCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      onMessage(data.message);
      setShowAuthSetup(false);
      setNewAuthCode('');
      await loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading('');
    }
  }

  async function activateOverride(e: FormEvent) {
    e.preventDefault();
    const maxMin = platform?.maxBypassMinutes ?? 43200;
    const duration = resolveBypassMinutes(durationPreset, customDuration, maxMin);
    setLoading('activate');
    try {
      const res = await fetch('/api/security/emergency-override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...activateForm, duration }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Activation failed');
      onMessage(data.message || 'Emergency bypass activated');
      setShowActivate(false);
      setActivateForm({ reason: '', authorization: '' });
      setDurationPreset('60');
      await loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Activation failed');
    } finally {
      setLoading('');
    }
  }

  async function disableBypass() {
    if (!confirm('End all active emergency bypasses? Monitoring will resume.')) return;
    setLoading('disable-bypass');
    try {
      const res = await fetch('/api/security/emergency-override/disable', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      onMessage('Emergency bypass ended');
      await loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading('');
    }
  }

  const bypassActive = Boolean(platform?.emergency.isActive && !platform?.emergency.isExpired);
  const authConfigured = Boolean(platform?.authCodeConfigured);
  const maxBypassMinutes = platform?.maxBypassMinutes ?? 43200;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-indigo-600" />
            <h2 className="font-semibold text-slate-900">Security platform</h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Background worker + break-glass bypass. See{' '}
            <code className="rounded bg-slate-100 px-1 text-xs">docs/SECURITY.md</code>.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshMonitoringStatus}
          disabled={!!loading}
          title="Re-check active issues, clear resolved events, and update threat level"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${loading === 'reconcile' || loading === 'load' ? 'animate-spin' : ''}`}
          />
          Refresh status
        </button>
      </div>

      {!platform ? (
        <p className="text-sm text-slate-500">{loading === 'load' ? 'Loading…' : 'Unavailable'}</p>
      ) : (
        <>
          {/* Score + features */}
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50 to-white p-5">
              <p className="text-xs font-semibold uppercase text-slate-500">Security score</p>
              <p className="mt-1 text-4xl font-bold text-slate-900">{platform.securityScore}</p>
              <p className="mt-1 text-sm text-slate-500">0–100 based on threat level and 24h activity</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Active modules (24h)</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-medium">File integrity</span>
                  <p className="text-slate-500">{platform.features.fileIntegrity.lastIssues24h} issues</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-medium">Activity</span>
                  <p className="text-slate-500">{platform.features.activityMonitor.suspicious24h} suspicious</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-medium">Intrusion IDS</span>
                  <p className="text-slate-500">
                    {metrics?.intrusion.threats24h ?? platform.features.intrusionDetection.threats24h} threats
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <span className="font-medium">Bot detection</span>
                  <p className="text-slate-500">
                    {metrics?.bot.detected24h ?? platform.features.botDetection.bots24h} detected
                  </p>
                </div>
              </div>
            </div>
          </div>

          {metrics && (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">Intrusion detection</h4>
                <p className="mt-1 text-xs text-slate-500">{metrics.intrusion.enabled ? 'Enabled' : 'Disabled'}</p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>Threats (24h): {metrics.intrusion.threats24h}</li>
                  <li>Blocked IPs: {metrics.intrusion.blockedIps}</li>
                  <li>Rate limited (24h): {metrics.intrusion.rateLimited24h}</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">Bot detection</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {metrics.bot.enabled ? 'Enabled' : 'Disabled'}
                  {metrics.bot.captchaEnabled ? ' · CAPTCHA on' : ''}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>Detected (24h): {metrics.bot.detected24h}</li>
                  <li>IPs blocked (24h): {metrics.bot.blocked24h}</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-semibold text-slate-800">Auto-repair</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {metrics.repair.enabled ? 'Enabled — uses latest backup' : 'Disabled (detect only)'}
                </p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>Attempts (24h): {metrics.repair.attempted24h}</li>
                  <li>Succeeded (24h): {metrics.repair.succeeded24h}</li>
                </ul>
                <label className="mt-3 flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={metrics.repair.enabled}
                    onChange={async (e) => {
                      await fetch('/api/security/module-toggles', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ key: 'security_repair_enabled', value: e.target.checked }),
                      });
                      loadAll();
                    }}
                  />
                  Enable auto-repair from backups
                </label>
              </div>
            </div>
          )}

          {metrics && metrics.blockedIps.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-slate-800">Blocked IP addresses</h4>
              <ul className="mt-2 max-h-32 overflow-y-auto text-sm">
                {metrics.blockedIps.map((b) => (
                  <li key={b.ip} className="flex justify-between border-b border-slate-50 py-1">
                    <span className="font-mono">{b.ip}</span>
                    <button
                      type="button"
                      className="text-xs text-indigo-600"
                      onClick={async () => {
                        await fetch('/api/security/blocked-ips', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'unblock', ip: b.ip }),
                        });
                        loadAll();
                      }}
                    >
                      Unblock
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-sm text-slate-500">
            System recovery and ZIP restores are on the <strong>Backup</strong> settings tab (replaces the old
            emergency recovery API).
          </p>

          {/* Status row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <Server className="h-4 w-4 text-slate-400" />
                <WorkerBadge health={platform.worker.health} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Background worker</p>
              <p className="text-sm font-medium text-slate-800">
                {platform.worker.lastHeartbeat
                  ? new Date(platform.worker.lastHeartbeat).toLocaleString()
                  : 'No heartbeat — run npm run security:worker'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {platform.worker.checksTotal} checks · v{platform.worker.version ?? '?'} · every{' '}
                {Math.round(platform.worker.intervalMs / 1000)}s
              </p>
              {platform.worker.lastError && (
                <p className="mt-2 text-xs text-red-600">{platform.worker.lastError}</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <Activity className="h-4 w-4 text-slate-400" />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={refreshMonitoringStatus}
                    disabled={!!loading}
                    title="Clear resolved events and update threat level"
                    className="inline-flex items-center rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${loading === 'reconcile' ? 'animate-spin' : ''}`} />
                  </button>
                  <ThreatBadge level={platform.monitoring.threatLevel} />
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Monitoring</p>
              <p className="text-sm font-medium capitalize text-slate-800">
                {platform.monitoring.enabled ? 'Enabled' : 'Disabled'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {platform.monitoring.eventsLast24h} events (24h) · {platform.protectedFiles} protected files
              </p>
            </div>

            <div
              className={`rounded-2xl border p-4 shadow-sm sm:col-span-2 ${
                bypassActive ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <ShieldAlert className={`h-4 w-4 ${bypassActive ? 'text-amber-700' : 'text-emerald-600'}`} />
                <span className="text-xs font-semibold uppercase text-slate-600">Emergency bypass</span>
              </div>
              <p className={`mt-2 text-sm font-semibold ${bypassActive ? 'text-amber-900' : 'text-emerald-800'}`}>
                {bypassActive ? 'ACTIVE — checks paused' : 'Inactive — normal protection'}
              </p>
              {bypassActive && platform.emergency.expiresAt && (
                <p className="mt-1 text-xs text-amber-800">
                  Expires {new Date(platform.emergency.expiresAt).toLocaleString()}
                </p>
              )}
              {bypassActive && (
                <button
                  type="button"
                  onClick={disableBypass}
                  className="mt-3 rounded-lg bg-amber-900 px-3 py-1.5 text-xs font-medium text-white"
                >
                  End bypass
                </button>
              )}
            </div>
          </div>

          {/* Monitoring controls */}
          <section className="rounded-2xl border border-slate-200 p-5">
            <h3 className="font-semibold text-slate-900">Monitoring controls</h3>
            <p className="mt-1 text-sm text-slate-500">
              Start the worker with <code className="rounded bg-slate-100 px-1">npm run security:worker</code> or{' '}
              <code className="rounded bg-slate-100 px-1">npm run dev:all</code>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {platform.monitoring.enabled ? (
                <button
                  type="button"
                  onClick={() => toggleMonitoring(false)}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900"
                >
                  <Power className="h-4 w-4" />
                  Disable monitoring
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleMonitoring(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
                >
                  <Power className="h-4 w-4" />
                  Enable monitoring
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  setLoading('integrity');
                  try {
                    const res = await fetch('/api/security/file-integrity');
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);
                    setIntegrityItems(data.report?.items ?? []);
                  } catch (err) {
                    onError(err instanceof Error ? err.message : 'Failed');
                  } finally {
                    setLoading('');
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"
              >
                File integrity report
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm('Refresh baselines for all protected files? Do this after a trusted deploy.')) return;
                  setLoading('rebaseline');
                  try {
                    const res = await fetch('/api/security/file-integrity', { method: 'POST' });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);
                    onMessage(data.message);
                    setIntegrityItems(data.report?.items ?? []);
                  } catch (err) {
                    onError(err instanceof Error ? err.message : 'Failed');
                  } finally {
                    setLoading('');
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"
              >
                Rebaseline files
              </button>
              <button
                type="button"
                onClick={async () => {
                  setLoading('events');
                  try {
                    const res = await fetch('/api/security/events?limit=50');
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.message);
                    setAllEvents(data.events ?? []);
                  } catch (err) {
                    onError(err instanceof Error ? err.message : 'Failed');
                  } finally {
                    setLoading('');
                  }
                }}
                className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"
              >
                View all events
              </button>
              <button
                type="button"
                disabled={authConfigured}
                title={
                  authConfigured
                    ? 'Master authorization code is already configured'
                    : 'Set the master code used for bypass and disable monitoring'
                }
                onClick={() => !authConfigured && setShowAuthSetup(true)}
                className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium ${
                  authConfigured ? disabledBtnClass : ''
                }`}
              >
                <KeyRound className="h-4 w-4" />
                {authConfigured ? 'Master code configured' : 'Set master auth code'}
              </button>
              <button
                type="button"
                disabled={bypassActive}
                title={
                  bypassActive
                    ? 'Emergency bypass is already active — use End bypass above'
                    : 'Activate time-limited security bypass'
                }
                onClick={() => !bypassActive && setShowActivate(true)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium ${
                  bypassActive
                    ? disabledBtnClass
                    : 'bg-red-600 text-white hover:bg-red-700'
                }`}
              >
                <AlertTriangle className="h-4 w-4" />
                Activate bypass
              </button>
            </div>

            {showDisable && (
              <form
                className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  toggleMonitoring(false);
                }}
              >
                <p className="text-sm font-medium text-amber-900">Authorization required (S-CLS1 + developer mode)</p>
                <input
                  type="password"
                  required
                  value={disableAuth}
                  onChange={(e) => setDisableAuth(e.target.value)}
                  className={inputClass}
                  placeholder="Authorization code"
                />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-xl bg-amber-900 px-4 py-2 text-sm text-white">
                    Confirm
                  </button>
                  <button type="button" onClick={() => setShowDisable(false)} className="rounded-xl border px-4 py-2 text-sm">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {integrityItems && (
              <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border bg-slate-50 p-3 text-xs">
                <p className="mb-2 font-semibold text-slate-700">Protected files</p>
                {integrityItems.map((item) => (
                  <div key={item.path} className="flex justify-between gap-2 border-b border-slate-100 py-1">
                    <span className="truncate font-mono">{item.path}</span>
                    <span className={item.status === 'ok' ? 'text-emerald-600' : 'text-red-600'}>{item.status}</span>
                  </div>
                ))}
              </div>
            )}

            {(allEvents ?? platform.recentEvents).length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    Recent events ({allEvents ? allEvents.length : platform.recentEvents.length}
                    {allEvents ? '' : ' of ' + platform.monitoring.eventsLast24h})
                  </p>
                  <button
                    type="button"
                    onClick={refreshMonitoringStatus}
                    disabled={!!loading}
                    className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-60"
                  >
                    <RefreshCw className={`h-3 w-3 ${loading === 'reconcile' ? 'animate-spin' : ''}`} />
                    Clear resolved
                  </button>
                </div>
                <ul className="max-h-40 space-y-2 overflow-y-auto text-sm">
                  {(allEvents ?? platform.recentEvents).map((ev) => (
                    <li key={ev.id} className="rounded-lg border bg-slate-50/80 px-3 py-2">
                      <span className="font-medium">{ev.eventType}</span>
                      <span className="text-slate-400"> · {ev.severity} · </span>
                      {ev.description.slice(0, 100)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Override history */}
          <section className="rounded-2xl border border-slate-200 overflow-hidden">
            <div className="border-b bg-slate-50 px-4 py-3">
              <h3 className="font-semibold text-slate-900">Bypass history</h3>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b text-left text-slate-500">
                  <th className="px-4 py-2">Reason</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">When</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {overrides.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-slate-500">
                      No records
                    </td>
                  </tr>
                ) : (
                  overrides.map((o) => (
                    <tr key={o.id}>
                      <td className="max-w-xs truncate px-4 py-2">{o.reason}</td>
                      <td className="px-4 py-2 capitalize">{o.status}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {o.createdAt ? new Date(o.createdAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <button
                          type="button"
                          title="Delete"
                          onClick={async () => {
                            if (!confirm('Delete this record?')) return;
                            await fetch(`/api/emergency/overrides/${o.id}`, { method: 'DELETE' });
                            loadAll();
                          }}
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      )}

      {showActivate && !bypassActive && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-red-700">Activate emergency bypass</h3>
            <p className="mt-2 text-sm text-slate-600">
              Pauses file-integrity and activity checks until expiry or manual end. Fully audited.
            </p>
            <form onSubmit={activateOverride} className="mt-4 space-y-4">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Reason</span>
                <textarea
                  required
                  rows={3}
                  placeholder="Explain why this bypass is necessary…"
                  value={activateForm.reason}
                  onChange={(e) => setActivateForm({ ...activateForm, reason: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div>
                <span className="mb-2 block text-xs font-medium text-slate-500">Duration</span>
                <div className="flex flex-wrap gap-2">
                  {BYPASS_DURATION_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setDurationPreset(p.key)}
                      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                        durationPreset === p.key
                          ? 'bg-red-600 text-white'
                          : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDurationPreset('custom')}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                      durationPreset === 'custom'
                        ? 'bg-red-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {durationPreset === 'custom' && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      type="number"
                      min={1}
                      max={durationPreset === 'custom' && customDuration.unit === 'days' ? 31 : 999}
                      required
                      value={customDuration.amount}
                      onChange={(e) =>
                        setCustomDuration({ ...customDuration, amount: Number(e.target.value) || 1 })
                      }
                      className={`${inputClass} w-24`}
                    />
                    <select
                      value={customDuration.unit}
                      onChange={(e) =>
                        setCustomDuration({
                          ...customDuration,
                          unit: e.target.value as 'minutes' | 'hours' | 'days',
                        })
                      }
                      className={inputClass}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>
                )}

                <p className="mt-2 text-xs text-slate-500">
                  Selected:{' '}
                  <strong>
                    {formatDurationSummary(
                      resolveBypassMinutes(durationPreset, customDuration, maxBypassMinutes)
                    )}
                  </strong>
                  {` (max ${formatDurationSummary(maxBypassMinutes)})`}
                </p>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Authorization code</span>
                <input
                  type="password"
                  required
                  autoComplete="off"
                  placeholder="Master or environment authorization code"
                  value={activateForm.authorization}
                  onChange={(e) => setActivateForm({ ...activateForm, authorization: e.target.value })}
                  className={inputClass}
                />
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowActivate(false)}
                  className="rounded-xl border px-4 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading === 'activate'}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {loading === 'activate' ? 'Activating…' : 'Activate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAuthSetup && !authConfigured && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold">Master authorization code</h3>
            <p className="mt-2 text-sm text-slate-600">
              Used for bypass activation and disabling monitoring. Stored as bcrypt hash (S-CLS1 only). Min 8
              characters. After saving, this control is locked until the code is cleared in the database.
            </p>
            <form onSubmit={saveAuthCode} className="mt-4 space-y-3">
              <input
                type="password"
                required
                minLength={8}
                value={newAuthCode}
                onChange={(e) => setNewAuthCode(e.target.value)}
                className={inputClass}
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowAuthSetup(false)} className="rounded-xl border px-4 py-2 text-sm">
                  Cancel
                </button>
                <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
