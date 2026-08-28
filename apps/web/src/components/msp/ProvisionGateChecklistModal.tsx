'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import type { GateStatus } from '@/lib/management-systems-shared';
import type { ProvisionChecklist } from '@/lib/provisioning-checklist';
import { gateStatusLabel } from '@/lib/provisioning-checklist';
import { gateStatusIcon } from '@/lib/management-system-provision';
import { ProvisionChecklistView } from '@/components/msp/ProvisionChecklistView';

type GateKind = 'provision' | 'install';

type Props = {
  open: boolean;
  onClose: () => void;
  gate: GateKind;
  clientName: string;
  status: GateStatus;
  projectRoot: string;
  runId?: string;
  completedAt?: string;
};

export function ProvisionGateChecklistModal({
  open,
  onClose,
  gate,
  clientName,
  status,
  projectRoot,
  runId,
  completedAt,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [checklist, setChecklist] = useState<ProvisionChecklist | null>(null);
  const [reportMarkdown, setReportMarkdown] = useState('');
  const [result, setResult] = useState('');
  const [tab, setTab] = useState<'checklist' | 'report'>('checklist');

  const load = useCallback(async () => {
    if (!runId?.trim() || !projectRoot?.trim()) {
      setError('No provision run recorded for this gate yet.');
      setChecklist(null);
      setReportMarkdown('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        projectRoot,
        runId,
      });
      const res = await fetch(`/api/msp/management-systems/gate-checklist?${qs}`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load checklist');
      setChecklist(data.checklist || null);
      setReportMarkdown(data.reportMarkdown || '');
      setResult(String(data.result || ''));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setChecklist(null);
      setReportMarkdown('');
    } finally {
      setLoading(false);
    }
  }, [projectRoot, runId]);

  useEffect(() => {
    if (open) {
      setTab('checklist');
      void load();
    }
  }, [open, load]);

  if (!open) return null;

  const iconKind = gateStatusIcon(status);
  const gateTitle = gate === 'install' ? 'Install gate' : 'Provision gate';
  const phaseFilter = gate === 'install' ? ['Install'] : ['Readiness', 'Package'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-start gap-3">
            {iconKind === 'pass' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            ) : iconKind === 'fail' ? (
              <XCircle className="mt-0.5 h-5 w-5 text-red-500" />
            ) : (
              <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-amber-500" />
            )}
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{gateTitle}</h2>
              <p className="text-sm text-slate-600">{clientName}</p>
              <p className="mt-1 text-xs text-slate-500">
                {gateStatusLabel(status)}
                {runId ? ` · Run ${runId}` : ''}
                {completedAt ? ` · ${new Date(completedAt).toLocaleString()}` : ''}
                {result ? ` · ${result}` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 px-5">
          <button
            type="button"
            onClick={() => setTab('checklist')}
            className={`px-4 py-2 text-sm font-medium ${
              tab === 'checklist'
                ? 'border-b-2 border-indigo-600 text-indigo-600'
                : 'text-slate-500'
            }`}
          >
            Checklist
          </button>
          <button
            type="button"
            onClick={() => setTab('report')}
            className={`px-4 py-2 text-sm font-medium ${
              tab === 'report' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-slate-500'
            }`}
          >
            Audit report
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading gate details from Mini…
            </div>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : tab === 'checklist' ? (
            <ProvisionChecklistView
              checklist={checklist}
              phaseFilter={phaseFilter}
              emptyMessage="Checklist not available for this run. Try the audit report tab."
            />
          ) : (
            <pre className="max-h-[50vh] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
              {reportMarkdown || 'No audit report text available for this run.'}
            </pre>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
