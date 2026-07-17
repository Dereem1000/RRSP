'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Shield, ShieldAlert } from 'lucide-react';

type BadgeSummary = {
  issueCount: number;
  threatLevel: string;
  workerHealth: string;
  licenseApi: string;
  bypassActive: boolean;
  securityScore: number;
  monitoringEnabled: boolean;
  issues: Array<{ code: string; label: string }>;
};

const POLL_MS = 60_000;

export function SecurityStatusBadge() {
  const router = useRouter();
  const [summary, setSummary] = useState<BadgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/security/badge-summary', {
        credentials: 'include',
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return;
      const text = await res.text();
      if (!text.trim() || text.trimStart().startsWith('<')) return;
      const data = JSON.parse(text) as { summary?: BadgeSummary };
      if (data.summary) {
        setSummary(data.summary);
      }
    } catch {
      /* keep last known state */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || (loading && !summary)) return null;

  const issueCount = summary?.issueCount ?? 0;
  const hasIssues = issueCount > 0;
  const bypassActive = summary?.bypassActive ?? false;

  const tone = hasIssues
    ? 'border-red-300 bg-red-50 text-red-800 shadow-red-200/50 hover:bg-red-100'
    : bypassActive
      ? 'border-amber-300 bg-amber-50 text-amber-900 shadow-amber-200/50 hover:bg-amber-100'
      : 'border-indigo-200 bg-white text-indigo-900 shadow-indigo-200/40 hover:bg-indigo-50';

  const ariaLabel = hasIssues
    ? `Security: ${issueCount} issue${issueCount === 1 ? '' : 's'}. Open security settings.`
    : bypassActive
      ? 'Security: emergency bypass active. Open security settings.'
      : 'Security status OK. Open security settings.';

  return createPortal(
    <button
      type="button"
      onClick={() => router.push('/settings?tab=security')}
      aria-label={ariaLabel}
      title={
        hasIssues
          ? summary?.issues.map((i) => i.label).join('\n') || 'Security issues detected'
          : bypassActive
            ? 'Emergency bypass is active'
            : `Security score ${summary?.securityScore ?? '—'}`
      }
      className={`fixed right-4 z-50 flex items-center gap-2 rounded-full border px-3 py-2.5 text-sm font-semibold shadow-lg transition max-lg:bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] lg:bottom-6 lg:right-6 ${tone}`}
    >
      {hasIssues ? (
        <ShieldAlert className="h-5 w-5 shrink-0" aria-hidden />
      ) : (
        <Shield className="h-5 w-5 shrink-0" aria-hidden />
      )}
      <span className="hidden lg:inline">
        {hasIssues ? 'Security' : bypassActive ? 'Bypass on' : 'Security'}
      </span>
      {hasIssues && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">
          {issueCount > 9 ? '9+' : issueCount}
        </span>
      )}
      {bypassActive && !hasIssues && (
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-amber-200" aria-hidden />
      )}
      {!hasIssues && !bypassActive && summary != null && (
        <span className="text-xs font-medium opacity-80">{summary.securityScore}</span>
      )}
    </button>,
    document.body,
  );
}
