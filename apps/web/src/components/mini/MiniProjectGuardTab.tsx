'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { apiErrorMessage, parseFetchJsonResponse } from '@/lib/parse-fetch-json';
import { useAdaptiveMiniPoll } from '@/lib/use-adaptive-mini-poll';

type PolicyPreset = {
  name: string;
  label: string;
  description: string;
};

type AuditEvent = {
  event_type?: string;
  summary?: string;
  created_at?: string;
  details?: Record<string, unknown>;
};

type LicenseKitInfo = {
  detected?: boolean;
  stack?: string;
  system_key?: string;
  product_code?: string;
  system_name?: string;
};

type PolicyDiff = {
  added_writable_paths?: string[];
  removed_writable_paths?: string[];
  added_protected_paths?: string[];
  removed_protected_paths?: string[];
};

type MiniIntegrationLink = {
  linked?: boolean;
  connection_id?: string;
  system_key?: string;
  system_name?: string;
  company_name?: string;
  display_label?: string;
  status?: string;
  last_log_at?: string | null;
  log_count?: number;
  crm_base_url?: string;
};

type ProjectGuardDeployment = {
  deployment_id: string;
  project_name: string;
  project_path: string;
  project_fingerprint?: string;
  project_path_accessible?: boolean;
  remote?: boolean;
  connection_id?: string | null;
  monitoring_mode?: string;
  monitoring_label?: string;
  monitoring_note?: string;
  mini_integration?: MiniIntegrationLink;
  mini_integration_identity?: {
    system_key?: string;
    system_name?: string;
    company_name?: string;
    connection_id?: string;
  };
  status: string;
  created_at?: string;
  last_scan_at?: string | null;
  tracked_file_count?: number;
  restored_file_count?: number;
  deleted_file_count?: number;
  policy_review_state?: string;
  policy_review_error?: string | null;
  policy_sync_note?: string;
  agent_runtime_state?: string;
  agent_runtime_label?: string;
  attestation_state?: string;
  last_event?: string | null;
  last_attribution_summary?: string | null;
  last_deleted_files?: string[];
  last_fail_closed_files?: string[];
  last_restored_files?: string[];
  last_containment_at?: string | null;
  containment_history?: Array<{
    at?: string;
    fail_closed_files?: string[];
    deleted_files?: string[];
    restored_files?: string[];
    event?: string | null;
  }>;
  writable_paths?: string[];
  protected_paths?: string[];
  editable_writable_paths?: string[];
  editable_protected_paths?: string[];
  pending_writable_paths?: string[];
  policy_diff?: PolicyDiff;
  recent_audit_events?: AuditEvent[];
  reenable_at?: string | null;
  license_kit?: LicenseKitInfo;
  baseline_custody?: string;
  baseline_capture_mode?: string;
  baseline_source_path?: string | null;
  ship_package_path?: string | null;
  ship_manifest_sha256?: string | null;
  product_version?: string | null;
  baseline_manifest_sha256?: string | null;
  baseline_compromised?: boolean;
  mini_baseline_ready?: boolean;
  baseline_integrity?: {
    reason?: string;
    mismatches?: string[];
  };
  baseline_license_escalation?: {
    state?: string;
    reason?: string;
    message?: string;
    at?: string;
  };
};

type BaselinePushProgress = {
  deployment_id: string;
  operation: string;
  state: 'running' | 'completed' | 'failed' | 'cancelled';
  phase: string;
  percent: number;
  current: number;
  total: number;
  phase_label: string;
  message?: string;
  error?: string | null;
  source_path?: string;
  started_at?: string;
  updated_at?: string;
  completed_at?: string | null;
};

type ProjectGuardPayload = {
  baseline_push_jobs?: Record<string, BaselinePushProgress>;
  cd_msp_sync?: {
    configured?: boolean;
    msp_api_url?: string | null;
    token_preview?: string | null;
    token_fingerprint?: string | null;
    synced_at?: string | null;
  };
  project_guard?: {
    note?: string;
    active_count?: number;
    deployment_count?: number;
    policy_preset_count?: number;
    policy_presets?: PolicyPreset[];
    deployments?: ProjectGuardDeployment[];
  };
  system_logs?: {
    connections?: Array<{
      connection_id: string;
      system_name?: string;
      company_name?: string;
      display_label?: string;
      crm_base_url?: string;
      status: string;
      integration_kit_version?: string | null;
    }>;
  };
};

function pathList(lines: string[] | undefined): string {
  return (lines || []).join('\n') || '—';
}

function BaselineProgressPanel({
  progress,
  onCancel,
  cancelling,
}: {
  progress: BaselinePushProgress;
  onCancel?: () => void;
  cancelling?: boolean;
}) {
  const tone =
    progress.state === 'failed' || progress.state === 'cancelled'
      ? 'border-red-200 bg-red-50'
      : progress.state === 'completed'
        ? 'border-emerald-200 bg-emerald-50'
        : 'border-sky-200 bg-white';
  const barTone =
    progress.state === 'failed' || progress.state === 'cancelled'
      ? 'bg-red-500'
      : progress.state === 'completed'
        ? 'bg-emerald-500'
        : 'bg-sky-600';
  return (
    <div className={`space-y-2 rounded-xl border px-3 py-2 ${tone}`}>
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-800">{progress.phase_label || 'Baseline deploy'}</span>
        <span className="font-semibold text-slate-700">{Math.max(0, Math.min(100, progress.percent || 0))}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${barTone}`}
          style={{ width: `${Math.max(0, Math.min(100, progress.percent || 0))}%` }}
        />
      </div>
      <p className="text-xs text-slate-600">
        {progress.state === 'running'
          ? 'Saved on Mini — safe to refresh this page or restart Mini; progress will resume from disk.'
          : progress.message || progress.error || 'Baseline job finished.'}
      </p>
      {onCancel && progress.state !== 'completed' ? (
        <button
          type="button"
          disabled={cancelling}
          onClick={onCancel}
          className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
        >
          {cancelling
            ? 'Stopping…'
            : progress.state === 'running'
              ? 'Stop baseline'
              : 'Clear baseline status'}
        </button>
      ) : null}
    </div>
  );
}

function PolicyPathBlock({
  label,
  hint,
  paths,
  tone = 'slate',
}: {
  label: string;
  hint?: string;
  paths: string[] | undefined;
  tone?: 'slate' | 'emerald' | 'amber';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-slate-50';

  return (
    <div>
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
      <pre className={`mt-1 max-h-48 overflow-auto rounded-xl border px-3 py-2 font-mono text-xs text-slate-800 ${toneClass}`}>
        {pathList(paths)}
      </pre>
    </div>
  );
}

function monitoringTone(mode?: string): string {
  const key = (mode || '').toLowerCase();
  if (key === 'local' || key === 'mini_integration') return 'bg-emerald-100 text-emerald-800';
  if (key === 'local_degraded') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function statusTone(status: string): string {
  const key = status.toLowerCase();
  if (key === 'active' || key === 'running' || key === 'trusted' || key === 'clean') {
    return 'bg-emerald-100 text-emerald-800';
  }
  if (key.includes('pending') || key === 'disabled' || key === 'stopped' || key === 'partial') {
    return 'bg-amber-100 text-amber-800';
  }
  if (key === 'invalid' || key === 'quarantine') return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}

function suggestedPresetName(deployment: ProjectGuardDeployment): string {
  const systemKey = String(
    deployment.mini_integration_identity?.system_key || deployment.license_kit?.system_key || '',
  ).toLowerCase();
  const productCode = String(deployment.license_kit?.product_code || '').toLowerCase();
  const label = `${deployment.project_name || ''} ${deployment.mini_integration_identity?.system_name || ''}`.toLowerCase();
  if (systemKey === 'pos' || systemKey === 'pos-system' || productCode === 'pos' || label.includes('pos')) {
    return 'pos-system';
  }
  return 'mini-integrated-app';
}

async function guardAction<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/mini/external-systems/project-guard/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await parseFetchJsonResponse<T & { error?: string; external_systems?: ProjectGuardPayload; dashboard?: { external_systems?: ProjectGuardPayload } }>(res);
  if (!res.ok) {
    const fallback =
      action === 'deploy-baseline' && (res.status === 504 || res.status === 524)
        ? 'Deploy baseline timed out in the portal, but Mini may still be pushing files to the connected system. Wait 2–3 minutes, refresh this page, and check whether the red compromised banner cleared.'
        : `Project Guard ${action} failed`;
    throw new Error(apiErrorMessage(data, fallback));
  }
  return data;
}

function extractGuardPayload(result: {
  external_systems?: ProjectGuardPayload;
  dashboard?: { external_systems?: ProjectGuardPayload };
}): ProjectGuardPayload | null {
  if (result.external_systems?.project_guard) return result.external_systems;
  if (result.dashboard?.external_systems?.project_guard) return result.dashboard.external_systems;
  return null;
}

export function MiniProjectGuardTab() {
  const [payload, setPayload] = useState<ProjectGuardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [cancellingId, setCancellingId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [deployPath, setDeployPath] = useState('');
  const [remoteConnectionId, setRemoteConnectionId] = useState('');
  const [remotePackagePath, setRemotePackagePath] = useState(
    'E:\\AutoM.System\\provision\\2026-07-12-provision-v0.4.4',
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [policyDrafts, setPolicyDrafts] = useState<Record<string, string>>({});
  const [baselineSourceDrafts, setBaselineSourceDrafts] = useState<Record<string, string>>({});
  const [baselineCaptureModeDrafts, setBaselineCaptureModeDrafts] = useState<Record<string, string>>({});
  const [baselineProgress, setBaselineProgress] = useState<Record<string, BaselinePushProgress>>({});
  const [presetSelections, setPresetSelections] = useState<Record<string, string>>({});

  const guard = payload?.project_guard;
  const policyPresets = useMemo(() => guard?.policy_presets || [], [guard?.policy_presets]);
  const deployments = useMemo(() => guard?.deployments || [], [guard?.deployments]);
  const cdMspSync = payload?.cd_msp_sync;
  const compromisedDeployments = useMemo(
    () => deployments.filter((deployment) => deployment.baseline_compromised),
    [deployments],
  );
  const hasRunningBaselineJob = useMemo(
    () => Object.values(baselineProgress).some((job) => job.state === 'running'),
    [baselineProgress],
  );
  const licenseSyncBlockingTamper = Boolean(
    compromisedDeployments.length > 0 && cdMspSync && !cdMspSync.configured,
  );
  const acceptedConnections = useMemo(
    () =>
      (payload?.system_logs?.connections || []).filter(
        (row) => String(row.status || '').toLowerCase() === 'accepted',
      ),
    [payload?.system_logs?.connections],
  );

  const loadInFlightRef = useRef(false);

  const load = useCallback(async (): Promise<boolean> => {
    if (loadInFlightRef.current) return false;
    loadInFlightRef.current = true;
    setError('');
    try {
      const res = await fetch('/api/mini/external-systems', { cache: 'no-store', credentials: 'include' });
      if (res.status === 503 || res.status === 502 || res.status === 504 || res.status === 524) return false;
      const data = await parseFetchJsonResponse<ProjectGuardPayload & { error?: string }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Failed to load Project Guard'));
      setPayload(data);
      if (data.baseline_push_jobs) {
        // Only keep active/failed jobs — completed success panels must not stick after refresh.
        const activeJobs: Record<string, BaselinePushProgress> = {};
        for (const [id, job] of Object.entries(data.baseline_push_jobs)) {
          if (job?.state === 'running' || job?.state === 'failed') {
            activeJobs[id] = job;
          }
        }
        setBaselineProgress((prev) => {
          const merged = { ...prev, ...activeJobs };
          for (const [id, job] of Object.entries(data.baseline_push_jobs || {})) {
            if (job?.state === 'completed' || job?.state === 'cancelled') {
              delete merged[id];
            }
          }
          return merged;
        });
      }
      setPolicyDrafts((prev) => {
        const next = { ...prev };
        for (const deployment of data.project_guard?.deployments || []) {
          const serverDraft = (deployment.editable_writable_paths || []).join('\n');
          const existing = next[deployment.deployment_id];
          const reviewState = deployment.policy_review_state || 'clean';
          if (!existing || reviewState === 'clean') {
            next[deployment.deployment_id] = serverDraft;
          }
        }
        return next;
      });
      setBaselineSourceDrafts((prev) => {
        const next = { ...prev };
        for (const deployment of data.project_guard?.deployments || []) {
          const serverPath =
            deployment.ship_package_path ||
            deployment.baseline_source_path ||
            '';
          if (deployment.remote) {
            next[deployment.deployment_id] =
              serverPath ||
              next[deployment.deployment_id] ||
              'E:\\AutoM.System\\provision\\2026-07-12-provision-v0.4.4';
          } else if (!next[deployment.deployment_id]) {
            next[deployment.deployment_id] =
              deployment.baseline_source_path || deployment.project_path || '';
          }
        }
        return next;
      });
      setBaselineCaptureModeDrafts((prev) => {
        const next = { ...prev };
        for (const deployment of data.project_guard?.deployments || []) {
          const serverMode =
            deployment.baseline_capture_mode || (deployment.remote ? 'ship_manifest' : 'project_tree');
          next[deployment.deployment_id] = serverMode || next[deployment.deployment_id] || 'ship_manifest';
        }
        return next;
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Project Guard');
      return false;
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const refreshBaselineProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/mini/external-systems/project-guard/baseline-push-progress', {
        cache: 'no-store',
        credentials: 'include',
      });
      const data = await parseFetchJsonResponse<{ jobs?: BaselinePushProgress[] }>(res);
      const jobs = data.jobs;
      if (!res.ok || !Array.isArray(jobs)) return;
      const next: Record<string, BaselinePushProgress> = {};
      let shouldReload = false;
      for (const job of jobs) {
        if (!job.deployment_id) continue;
        // Keep only active/failed panels; cancelled/completed should not stick in the UI.
        if (job.state === 'running' || job.state === 'failed') {
          next[job.deployment_id] = job;
        }
      }
      setBaselineProgress((prev) => {
        const merged = { ...prev, ...next };
        for (const job of jobs) {
          if (
            job.deployment_id &&
            (job.state === 'cancelled' || job.state === 'completed') &&
            merged[job.deployment_id]
          ) {
            delete merged[job.deployment_id];
          }
        }
        return merged;
      });
      for (const job of jobs) {
        if (job.state === 'completed') {
          setNotice(job.message || 'Baseline deploy completed.');
          setBusyId((current) => (current === job.deployment_id ? '' : current));
          // Drop completed panel immediately; success is shown in the green notice.
          setBaselineProgress((prev) => {
            if (!prev[job.deployment_id]) return prev;
            const next = { ...prev };
            delete next[job.deployment_id];
            return next;
          });
          shouldReload = true;
        } else if (job.state === 'failed') {
          setError(job.error || job.message || 'Baseline deploy failed.');
          setBusyId((current) => (current === job.deployment_id ? '' : current));
        }
      }
      if (shouldReload) await load();
    } catch {
      // ignore transient poll failures
    }
  }, [load]);

  // Slow Mini responses (10–20s) used to stack every 20s and pressure the Next.js heap.
  useAdaptiveMiniPoll(true, load, { baseMs: 45_000, maxMs: 180_000 });

  useEffect(() => {
    if (!hasRunningBaselineJob) return undefined;
    refreshBaselineProgress();
    const id = window.setInterval(() => {
      refreshBaselineProgress();
    }, 2000);
    return () => window.clearInterval(id);
  }, [hasRunningBaselineJob, refreshBaselineProgress]);

  async function runForDeployment(deploymentId: string, action: string, body: Record<string, unknown> = {}) {
    setBusyId(deploymentId);
    if (action === 'cancel-baseline') setCancellingId(deploymentId);
    setNotice('');
    setError('');
    let keepBusy = false;
    try {
      const result = await guardAction<{
        external_systems?: ProjectGuardPayload;
        dashboard?: { external_systems?: ProjectGuardPayload };
        started?: boolean;
        progress?: BaselinePushProgress;
        message?: string;
      }>(action, { deployment_id: deploymentId, ...body });
      const nextPayload = extractGuardPayload(result);
      if (nextPayload) {
        setPayload(nextPayload);
        setPolicyDrafts((prev) => {
          const next = { ...prev };
          for (const deployment of nextPayload.project_guard?.deployments || []) {
            if (deployment.deployment_id === deploymentId || action === 'review-policy') {
              next[deployment.deployment_id] = (deployment.editable_writable_paths || []).join('\n');
            }
          }
          return next;
        });
      } else {
        await load();
      }
      if (action === 'review-policy' && body.approved === true) {
        const deployment = (nextPayload?.project_guard?.deployments || []).find(
          (item) => item.deployment_id === deploymentId,
        );
        if (deployment?.policy_review_state && deployment.policy_review_state !== 'clean') {
          throw new Error(
            deployment.policy_review_error ||
              `Policy is still ${deployment.policy_review_state.replace(/_/g, ' ')} after approval.`,
          );
        }
      }
      if (action === 'update-policy') {
        setNotice(
          (result as { message?: string }).message ||
            'Policy proposal saved on the connected system. Click Approve policy to enforce it.',
        );
      } else if (action === 'apply-preset') {
        setNotice(
          (result as { message?: string }).message ||
            'Policy preset proposed and approved on the connected system.',
        );
      } else if (action === 'cancel-baseline') {
        setBaselineProgress((prev) => {
          const next = { ...prev };
          delete next[deploymentId];
          return next;
        });
        setNotice(result.message || 'Baseline job cancelled.');
      } else if (action === 'deploy-baseline' || action === 'push-baseline') {
        if (result.progress) {
          setBaselineProgress((prev) => ({ ...prev, [deploymentId]: result.progress! }));
        }
        if (result.started) {
          keepBusy = true;
          setNotice(
            result.message ||
              'Baseline job started on Mini. Progress is saved on disk and survives page refresh.',
          );
        } else {
          setNotice(
            result.message ||
              (result as { warning?: string }).warning ||
              'Baseline captured on Mini and pushed to the connected system.',
          );
        }
      } else if (action === 'review-policy') {
        setNotice(
          (result as { message?: string }).message ||
            `Project Guard ${action.replace(/-/g, ' ')} completed.`,
        );
      } else {
        setNotice(`Project Guard ${action.replace(/-/g, ' ')} completed.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Project Guard ${action} failed`);
    } finally {
      if (!keepBusy) setBusyId('');
      if (action === 'cancel-baseline') setCancellingId('');
    }
  }

  async function saveAndApprovePolicy(deploymentId: string) {
    setBusyId(deploymentId);
    setNotice('');
    setError('');
    try {
      const writablePaths = (policyDrafts[deploymentId] || '')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      await guardAction('update-policy', { deployment_id: deploymentId, writable_paths: writablePaths });
      const result = await guardAction<{
        external_systems?: ProjectGuardPayload;
        dashboard?: { external_systems?: ProjectGuardPayload };
        message?: string;
      }>('review-policy', { deployment_id: deploymentId, approved: true });
      const nextPayload = extractGuardPayload(result);
      if (nextPayload) {
        setPayload(nextPayload);
        setPolicyDrafts((prev) => {
          const next = { ...prev };
          for (const deployment of nextPayload.project_guard?.deployments || []) {
            next[deployment.deployment_id] = (deployment.editable_writable_paths || []).join('\n');
          }
          return next;
        });
        const deployment = nextPayload.project_guard?.deployments?.find(
          (item) => item.deployment_id === deploymentId,
        );
        if (deployment?.policy_review_state && deployment.policy_review_state !== 'clean') {
          throw new Error(
            deployment.policy_review_error ||
              `Policy is still ${deployment.policy_review_state.replace(/_/g, ' ')} after approval.`,
          );
        }
      } else {
        await load();
      }
      setNotice(result.message || 'Policy saved and approved on the connected system.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save and approve failed');
    } finally {
      setBusyId('');
    }
  }

  async function deployProject() {
    const projectPath = deployPath.trim();
    if (!projectPath) {
      setError('Enter a project folder path to guard.');
      return;
    }
    setBusyId('deploy');
    setError('');
    setNotice('');
    try {
      const result = await guardAction<{
        external_systems?: ProjectGuardPayload;
        dashboard?: { external_systems?: ProjectGuardPayload };
      }>('deploy', { project_path: projectPath });
      const nextPayload = extractGuardPayload(result);
      if (nextPayload) setPayload(nextPayload);
      else await load();
      setDeployPath('');
      setNotice('Project Guard deployed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deploy failed');
    } finally {
      setBusyId('');
    }
  }

  async function deployRemote() {
    const connectionId = remoteConnectionId.trim();
    if (!connectionId) {
      setError('Select a connected system to deploy Project Guard remotely.');
      return;
    }
    setBusyId('remote-deploy');
    setError('');
    setNotice('');
    try {
      const result = await guardAction<{
        external_systems?: ProjectGuardPayload;
        dashboard?: { external_systems?: ProjectGuardPayload };
        remote?: { register?: { ok?: boolean; error?: string; deployment?: { deployment_id?: string } } };
        baseline_deploy?: { started?: boolean; progress?: BaselinePushProgress; message?: string; skipped?: boolean };
        package_path?: string;
        message?: string;
        error?: string;
      }>('remote-bootstrap', {
        connection_id: connectionId,
        auto_deploy_baseline: true,
        ...(remotePackagePath.trim() ? { package_path: remotePackagePath.trim() } : {}),
      });
      const registerResult = result.remote?.register;
      if (registerResult && registerResult.ok === false && registerResult.error) {
        throw new Error(`Remote bootstrap ran but Mini registration failed: ${registerResult.error}`);
      }
      const nextPayload = extractGuardPayload(result);
      if (nextPayload?.project_guard) {
        setPayload((prev) => ({ ...(prev || {}), project_guard: nextPayload.project_guard }));
      }
      const deploymentId =
        registerResult?.deployment?.deployment_id ||
        result.remote?.register?.deployment?.deployment_id ||
        '';
      if (deploymentId && result.baseline_deploy?.progress) {
        setBaselineProgress((prev) => ({
          ...prev,
          [deploymentId]: result.baseline_deploy!.progress!,
        }));
      }
      if (deploymentId && result.package_path) {
        setBaselineSourceDrafts((prev) => ({
          ...prev,
          [deploymentId]: result.package_path || prev[deploymentId] || '',
        }));
        setBaselineCaptureModeDrafts((prev) => ({
          ...prev,
          [deploymentId]: 'ship_manifest',
        }));
      }
      await load();
      if (result.baseline_deploy?.started) {
        setNotice(
          result.message ||
            'Remote Guard bootstrapped. Mini is pushing the provision baseline now — enforcement stays paused until it finishes.',
        );
      } else if (result.baseline_deploy?.skipped) {
        setNotice(
          result.message ||
            'Remote Guard bootstrapped, but Mini could not find a provision package. Deploy baseline manually from the deployment card.',
        );
      } else {
        setNotice(result.message || 'Remote Project Guard bootstrap completed on the connected system.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remote deploy failed');
    } finally {
      setBusyId('');
    }
  }

  async function pickFolder() {
    setBusyId('pick');
    setError('');
    try {
      const result = await guardAction<{ project_path?: string }>('pick-folder');
      if (result.project_path) {
        setDeployPath(result.project_path);
        setNotice('Folder selected from Mini host.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Folder picker failed');
    } finally {
      setBusyId('');
    }
  }

  if (loading && !payload) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading Project Guard…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{notice}</div>
      ) : null}

      {licenseSyncBlockingTamper ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">License sync required for baseline tamper response</p>
          <p className="mt-1">
            Mini does not have the CD MSP token, so compromised baselines cannot deactivate licenses yet. Open{' '}
            <a href="/settings?tab=integrations" className="font-semibold underline">
              Settings → Integrations
            </a>{' '}
            and click <strong>Sync to Mini</strong> on the License GUI sync token card.
          </p>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">License sync status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {cdMspSync?.configured ? 'Mini has CD MSP token' : 'Mini MSP token not configured'}
            </p>
            <p className="mt-1 text-xs text-slate-600">
              {cdMspSync?.configured
                ? `Preview ${cdMspSync.token_preview || '—'}${cdMspSync.synced_at ? ` · synced ${new Date(cdMspSync.synced_at).toLocaleString()}` : ''}`
                : 'Baseline tamper deactivation stays pending until the portal token is synced to Mini.'}
            </p>
          </div>
          <a
            href="/settings?tab=integrations"
            className="inline-flex items-center rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
          >
            Open Integrations settings
          </a>
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-violet-700" />
            <h2 className="text-xl font-bold text-slate-900">Project Guard</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">
            {guard?.note ||
              'Deploy integrity baselines to protected projects. Security events forward to CD through each project’s Mini integration when configured.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load().finally(() => setLoading(false));
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Active</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{guard?.active_count ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Deployments</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{guard?.deployment_count ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Policy presets</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{guard?.policy_preset_count ?? 0}</p>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Deploy to project</h3>
        <p className="mt-1 text-xs text-slate-500">
          Path is resolved on the Mini host. Use Pick folder when Mini runs on your desktop.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="text"
            value={deployPath}
            onChange={(e) => setDeployPath(e.target.value)}
            placeholder="E:\CRM or path on Mini host"
            className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          />
          <button
            type="button"
            onClick={pickFolder}
            disabled={busyId === 'pick'}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Pick folder
          </button>
          <button
            type="button"
            onClick={deployProject}
            disabled={busyId === 'deploy'}
            className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {busyId === 'deploy' ? 'Deploying…' : 'Deploy guard'}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-900">Deploy on connected system</h3>
        <p className="mt-1 text-xs text-slate-600">
          Bootstraps Project Guard on the customer app, then Mini automatically deploys the provision ship
          manifest baseline. You do not need a separate manual baseline step after this.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={remoteConnectionId}
            onChange={(e) => setRemoteConnectionId(e.target.value)}
            className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          >
            <option value="">Select accepted connection…</option>
            {acceptedConnections.map((connection) => (
              <option key={connection.connection_id} value={connection.connection_id}>
                {connection.company_name || connection.display_label || connection.system_name || connection.connection_id}
                {connection.integration_kit_version ? ` · kit ${connection.integration_kit_version}` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={deployRemote}
            disabled={busyId === 'remote-deploy' || acceptedConnections.length === 0}
            className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
          >
            {busyId === 'remote-deploy' ? 'Deploying remotely…' : 'Deploy on connected system'}
          </button>
        </div>
        <label className="mt-3 block text-xs font-medium text-slate-600">
          Provision package path on Mini host (ship manifest)
        </label>
        <input
          type="text"
          value={remotePackagePath}
          onChange={(e) => setRemotePackagePath(e.target.value)}
          placeholder="E:\Product\provision\YYYY-MM-DD-provision-vX.Y.Z"
          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
        />
        <p className="mt-1 text-xs text-slate-500">
          Path is on the Mini machine, not the customer server. Mini uses this for automatic baseline deploy after
          bootstrap; leave blank only if the provision folder is already registered in Mini Library.
        </p>
        {acceptedConnections.length === 0 ? (
          <p className="mt-2 text-xs text-amber-800">
            No accepted Mini integration connections yet. Accept a connection under System Logs first.
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        {deployments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
            No guarded projects yet. Deploy Project Guard to a product root that has Mini integration for security report forwarding.
          </div>
        ) : (
          deployments.map((deployment) => {
            const isOpen = expanded[deployment.deployment_id] ?? false;
            const policyPending = deployment.policy_review_state === 'pending_approval';
            const policyInvalid = deployment.policy_review_state === 'invalid';
            const policyRemote = deployment.remote || deployment.policy_review_state === 'remote';
            const baselineJob = baselineProgress[deployment.deployment_id];
            const busy =
              busyId === deployment.deployment_id || baselineJob?.state === 'running';

            return (
              <article key={deployment.deployment_id} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() =>
                        setExpanded((prev) => ({ ...prev, [deployment.deployment_id]: !isOpen }))
                      }
                      className="flex items-center gap-2 text-left"
                    >
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      )}
                      <h3 className="text-base font-semibold text-slate-900">{deployment.project_name}</h3>
                    </button>
                    <p className="mt-1 truncate text-xs text-slate-500">{deployment.project_path}</p>
                    {deployment.project_path_accessible === false ? (
                      <p className="mt-1 text-xs text-amber-800">
                        {deployment.remote ? 'Runs on connected system (not this Mini host)' : 'Path not on this Mini host'}
                      </p>
                    ) : null}
                    {deployment.remote ? (
                      <p className="mt-1 text-xs text-violet-800">Remote deployment via integration kit</p>
                    ) : null}
                    {deployment.monitoring_label ? (
                      <p className="mt-1">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${monitoringTone(deployment.monitoring_mode)}`}
                        >
                          {deployment.monitoring_label}
                        </span>
                      </p>
                    ) : null}
                    {deployment.mini_integration?.linked ? (
                      <p className="mt-1 text-xs text-slate-600">
                        {deployment.mini_integration.company_name
                          ? `${deployment.mini_integration.company_name}`
                          : deployment.mini_integration.system_name}
                        {deployment.mini_integration.system_name && deployment.mini_integration.company_name
                          ? ` · ${deployment.mini_integration.system_name}`
                          : ''}
                        {deployment.mini_integration.last_log_at
                          ? ` · last log ${deployment.mini_integration.last_log_at}`
                          : ''}
                      </p>
                    ) : null}
                    {deployment.monitoring_note ? (
                      <p className="mt-1 text-xs text-slate-500">{deployment.monitoring_note}</p>
                    ) : null}
                    <p className="mt-2 text-sm text-slate-600">{deployment.last_event || 'No events yet.'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(deployment.status)}`}>
                      {deployment.status}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(deployment.agent_runtime_state || 'unknown')}`}>
                      {deployment.agent_runtime_label || 'Agent'}
                    </span>
                    {deployment.license_kit?.detected ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
                        <Shield className="h-3 w-3" />
                        CD License
                        {deployment.license_kit.product_code ? ` (${deployment.license_kit.product_code})` : ''}
                      </span>
                    ) : null}
                    {deployment.baseline_compromised ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                        <ShieldAlert className="h-3 w-3" />
                        Baseline compromised
                      </span>
                    ) : deployment.mini_baseline_ready ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                        <ShieldCheck className="h-3 w-3" />
                        Mini baseline
                      </span>
                    ) : null}
                    {policyPending ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                        <ShieldAlert className="h-3 w-3" />
                        Policy pending
                      </span>
                    ) : policyInvalid ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
                        <ShieldAlert className="h-3 w-3" />
                        Policy invalid
                      </span>
                    ) : policyRemote ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-1 text-xs font-semibold text-violet-800">
                        <ShieldCheck className="h-3 w-3" />
                        Remote policy
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                        <ShieldCheck className="h-3 w-3" />
                        Policy synced
                      </span>
                    )}
                  </div>
                </div>

                {isOpen ? (
                  <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4">
                    <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <p className="font-medium text-slate-500">Tracked files</p>
                        <p className="mt-0.5 text-sm text-slate-900">{deployment.tracked_file_count ?? 0}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-500">Restores</p>
                        <p className="mt-0.5 text-sm text-slate-900">{deployment.restored_file_count ?? 0}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-500">Last scan</p>
                        <p className="mt-0.5 text-sm text-slate-900">{deployment.last_scan_at || 'never'}</p>
                      </div>
                      <div>
                        <p className="font-medium text-slate-500">Attestation</p>
                        <p className="mt-0.5 text-sm text-slate-900">{deployment.attestation_state || 'disabled'}</p>
                      </div>
                    </div>

                    {deployment.last_attribution_summary ? (
                      <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        {deployment.last_attribution_summary}
                      </p>
                    ) : null}

                    {(() => {
                      const failClosed = deployment.last_fail_closed_files || [];
                      const deleted = deployment.last_deleted_files || [];
                      const restored = deployment.last_restored_files || [];
                      const baselineMismatches = deployment.baseline_compromised
                        ? deployment.baseline_integrity?.mismatches || []
                        : [];
                      const history = deployment.containment_history || [];
                      const hasCurrentIncident =
                        failClosed.length > 0 ||
                        deleted.length > 0 ||
                        restored.length > 0 ||
                        baselineMismatches.length > 0;
                      const hasHistory =
                        history.length > 0 ||
                        Boolean(deployment.last_containment_at && hasCurrentIncident);
                      const hasActiveIssue = Boolean(deployment.baseline_compromised);

                      const renderLists = (
                        fail: string[],
                        del: string[],
                        rest: string[],
                        mismatches: string[],
                        keyPrefix: string,
                      ) => (
                        <>
                          {mismatches.length ? (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                                Baseline cache tampered ({mismatches.length})
                              </p>
                              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-amber-200 bg-white px-2 py-1.5 font-mono text-xs text-amber-950">
                                {mismatches.map((filePath) => (
                                  <li key={`${keyPrefix}-mismatch-${filePath}`}>{filePath}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {fail.length ? (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-red-900">
                                Fail-closed removed ({fail.length})
                              </p>
                              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-red-200 bg-white px-2 py-1.5 font-mono text-xs text-red-950">
                                {fail.map((filePath) => (
                                  <li key={`${keyPrefix}-fail-${filePath}`}>{filePath}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {del.length ? (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-red-900">
                                Deleted live files ({del.length})
                              </p>
                              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-red-200 bg-white px-2 py-1.5 font-mono text-xs text-red-950">
                                {del.map((filePath) => (
                                  <li key={`${keyPrefix}-del-${filePath}`}>{filePath}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                          {rest.length ? (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-900">
                                Restored from baseline ({rest.length})
                              </p>
                              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto rounded-lg border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-emerald-950">
                                {rest.map((filePath) => (
                                  <li key={`${keyPrefix}-rest-${filePath}`}>{filePath}</li>
                                ))}
                              </ul>
                            </div>
                          ) : null}
                        </>
                      );

                      const historyBlock =
                        history.length > 0 || (hasCurrentIncident && !hasActiveIssue) ? (
                          <details className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                              Containment history
                              {deployment.last_containment_at
                                ? ` · last ${deployment.last_containment_at}`
                                : ''}
                            </summary>
                            <div className="mt-2 space-y-3 border-t border-slate-200 pt-2">
                              <p className="text-xs text-slate-500">
                                Prior Guard incidents (newest first). Current open issues are shown above
                                when the baseline is compromised.
                              </p>
                              {!hasActiveIssue && hasCurrentIncident ? (
                                <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
                                  <p className="text-xs font-medium text-slate-700">
                                    Latest{deployment.last_containment_at ? ` · ${deployment.last_containment_at}` : ''}
                                  </p>
                                  {renderLists(failClosed, deleted, restored, [], 'latest')}
                                </div>
                              ) : null}
                              {history.map((entry, index) => (
                                <div
                                  key={`history-${entry.at || index}`}
                                  className="space-y-2 rounded-lg border border-slate-200 bg-white p-2"
                                >
                                  <p className="text-xs font-medium text-slate-700">
                                    {entry.at || `Incident ${index + 1}`}
                                  </p>
                                  {entry.event ? (
                                    <p className="text-xs text-slate-500">{entry.event}</p>
                                  ) : null}
                                  {renderLists(
                                    entry.fail_closed_files || [],
                                    entry.deleted_files || [],
                                    entry.restored_files || [],
                                    [],
                                    `hist-${index}`,
                                  )}
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : null;

                      if (hasActiveIssue && hasCurrentIncident) {
                        return (
                          <div className="space-y-3">
                            <section className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3">
                              <div>
                                <h4 className="text-sm font-semibold text-red-950">
                                  Containment actions (current)
                                </h4>
                                <p className="mt-0.5 text-xs text-red-900/80">
                                  Active baseline issue from the latest containment scan only. Older
                                  incidents are under Containment history.
                                </p>
                                {deployment.last_containment_at ? (
                                  <p className="mt-1 text-xs text-red-800/70">
                                    Current incident: {deployment.last_containment_at}
                                  </p>
                                ) : null}
                              </div>
                              {renderLists(
                                failClosed,
                                deleted,
                                restored,
                                baselineMismatches,
                                'current',
                              )}
                            </section>
                            {historyBlock}
                          </div>
                        );
                      }

                      if (hasActiveIssue) {
                        return (
                          <section className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3">
                            <div>
                              <h4 className="text-sm font-semibold text-red-950">Containment actions</h4>
                              <p className="mt-0.5 text-xs text-red-900/80">
                                Baseline is compromised. Waiting for the next Guard heartbeat with
                                containment details.
                              </p>
                              {baselineMismatches.length
                                ? renderLists([], [], [], baselineMismatches, 'mismatch-only')
                                : null}
                            </div>
                          </section>
                        );
                      }

                      return historyBlock;
                    })()}

                    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Enforced policy</h4>
                        <p className="mt-0.5 text-xs text-slate-500">
                          What Project Guard is actively using after approval.
                          {deployment.remote
                            ? ' Loaded from the connected system. `**` protects all files except the writable paths listed.'
                            : deployment.license_kit?.detected
                              ? ' CD license kit paths are added automatically and shown here.'
                              : ''}
                        </p>
                        {deployment.policy_sync_note ? (
                          <p className="mt-1 text-xs text-violet-800">{deployment.policy_sync_note}</p>
                        ) : null}
                      </div>
                      <div className="grid gap-3 lg:grid-cols-2">
                        <PolicyPathBlock
                          label="Enforced writable paths"
                          paths={deployment.writable_paths}
                          tone="emerald"
                        />
                        <PolicyPathBlock
                          label="Protected paths"
                          hint="Files matching these patterns are guarded and restored if changed."
                          paths={deployment.protected_paths}
                        />
                      </div>
                    </section>

                    <section className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">Mini baseline custody</h4>
                        <p className="mt-0.5 text-xs text-slate-600">
                          Mini keeps the authoritative baseline from the provision ship manifest (files installed on
                          the customer system). Runtime data stays writable via update-layout policy. Deploy baseline
                          after provision install; Mini app updates refresh ship paths automatically.
                        </p>
                      </div>
                      {deployment.baseline_compromised ? (
                        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
                          Remote baseline cache is compromised
                          {deployment.baseline_integrity?.reason
                            ? `: ${deployment.baseline_integrity.reason.replace(/_/g, ' ')}`
                            : ''}
                          . Restore is disabled until you deploy baseline again.
                        </p>
                      ) : null}
                      {deployment.baseline_compromised ? (
                        <p
                          className={`rounded-lg border px-3 py-2 text-xs ${
                            deployment.baseline_license_escalation?.state === 'deactivated'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                              : 'border-amber-200 bg-amber-50 text-amber-950'
                          }`}
                        >
                          <span className="font-semibold">License deactivation: </span>
                          {deployment.baseline_license_escalation?.state === 'deactivated'
                            ? deployment.baseline_license_escalation.message ||
                              'CD license deactivated and remote system license refresh requested.'
                            : deployment.baseline_license_escalation?.state === 'pending'
                              ? deployment.baseline_license_escalation.message ||
                                'Pending — CD portal will deactivate the license on refresh. Mini also retries the MSP API.'
                              : 'In progress — Mini is retrying CD license deactivation.'}
                        </p>
                      ) : null}
                      <div className="grid gap-2 text-xs text-slate-700 sm:grid-cols-2">
                        <p>
                          <span className="font-medium text-slate-500">Mini baseline ready:</span>{' '}
                          {deployment.mini_baseline_ready ? 'yes' : 'no'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-500">Capture mode:</span>{' '}
                          {deployment.baseline_capture_mode || 'project_tree'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-500">Product version:</span>{' '}
                          {deployment.product_version || 'not set'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-500">Ship files:</span>{' '}
                          {deployment.tracked_file_count ?? 0}
                        </p>
                        <p>
                          <span className="font-medium text-slate-500">Manifest hash:</span>{' '}
                          {deployment.baseline_manifest_sha256
                            ? `${deployment.baseline_manifest_sha256.slice(0, 12)}…`
                            : 'not set'}
                        </p>
                      </div>
                      <label className="text-xs font-medium text-slate-500">Baseline capture mode</label>
                      <select
                        value={baselineCaptureModeDrafts[deployment.deployment_id] || 'ship_manifest'}
                        onChange={(e) =>
                          setBaselineCaptureModeDrafts((prev) => ({
                            ...prev,
                            [deployment.deployment_id]: e.target.value,
                          }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                      >
                        <option value="ship_manifest">Ship manifest (provision package)</option>
                        <option value="project_tree">Project tree (legacy)</option>
                      </select>
                      <label className="text-xs font-medium text-slate-500">
                        {baselineCaptureModeDrafts[deployment.deployment_id] === 'project_tree'
                          ? 'Trusted source directory (Mini host)'
                          : 'Provision package path (Mini host)'}
                      </label>
                      <input
                        type="text"
                        value={baselineSourceDrafts[deployment.deployment_id] || ''}
                        onChange={(e) =>
                          setBaselineSourceDrafts((prev) => ({
                            ...prev,
                            [deployment.deployment_id]: e.target.value,
                          }))
                        }
                        placeholder="E:\Product\provision\YYYY-MM-DD-provision-vX.Y.Z"
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
                      />
                      {baselineJob ? (
                        <BaselineProgressPanel
                          progress={baselineJob}
                          cancelling={cancellingId === deployment.deployment_id}
                          onCancel={() =>
                            runForDeployment(deployment.deployment_id, 'cancel-baseline', {})
                          }
                        />
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runForDeployment(deployment.deployment_id, 'deploy-baseline', {
                            source_path: baselineSourceDrafts[deployment.deployment_id] || '',
                            capture_mode:
                              baselineCaptureModeDrafts[deployment.deployment_id] || 'ship_manifest',
                            package_path:
                              baselineCaptureModeDrafts[deployment.deployment_id] === 'project_tree'
                                ? ''
                                : baselineSourceDrafts[deployment.deployment_id] || '',
                          })
                        }
                        className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60"
                      >
                        Deploy baseline
                      </button>
                    </section>

                    {policyPending || policyInvalid ? (
                      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                        <p className="text-sm font-medium text-amber-950">Policy review required</p>
                        {policyInvalid && deployment.policy_review_error ? (
                          <p className="mt-1 text-xs text-amber-900">{deployment.policy_review_error}</p>
                        ) : null}
                        {deployment.policy_diff ? (
                          <div className="grid gap-2 text-xs text-amber-950 sm:grid-cols-2">
                            <p>
                              <span className="font-medium">Added writable:</span>{' '}
                              {(deployment.policy_diff.added_writable_paths || []).join(', ') || 'none'}
                            </p>
                            <p>
                              <span className="font-medium">Removed writable:</span>{' '}
                              {(deployment.policy_diff.removed_writable_paths || []).join(', ') || 'none'}
                            </p>
                            <p>
                              <span className="font-medium">Added protected:</span>{' '}
                              {(deployment.policy_diff.added_protected_paths || []).join(', ') || 'none'}
                            </p>
                            <p>
                              <span className="font-medium">Removed protected:</span>{' '}
                              {(deployment.policy_diff.removed_protected_paths || []).join(', ') || 'none'}
                            </p>
                          </div>
                        ) : null}
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={busy || policyInvalid}
                            onClick={() => runForDeployment(deployment.deployment_id, 'review-policy', { approved: true })}
                            className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                          >
                            Approve policy
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runForDeployment(deployment.deployment_id, 'review-policy', { approved: false })}
                            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                          >
                            Deny policy
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {policyPresets.length > 0 ? (
                      <div>
                        <label className="text-xs font-medium text-slate-500">Policy preset</label>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Choose a Mini rule set, then apply it. For CRM and other Mini-integrated apps use{' '}
                          <span className="font-medium">Mini Integrated App</span>. Remote deployments propose and
                          approve on the connected system automatically.
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <select
                            value={
                              presetSelections[deployment.deployment_id] ||
                              suggestedPresetName(deployment)
                            }
                            onChange={(e) =>
                              setPresetSelections((prev) => ({
                                ...prev,
                                [deployment.deployment_id]: e.target.value,
                              }))
                            }
                            className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                          >
                            {policyPresets.map((preset) => (
                              <option key={preset.name} value={preset.name}>
                                {preset.label} — {preset.description}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              runForDeployment(deployment.deployment_id, 'apply-preset', {
                                preset_name:
                                  presetSelections[deployment.deployment_id] ||
                                  suggestedPresetName(deployment),
                              })
                            }
                            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
                          >
                            Apply preset
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-800">
                        Policy presets are not loaded from Mini yet. Restart Mini so it picks up the latest Project
                        Guard policy catalog, then refresh this page.
                      </p>
                    )}

                    <div>
                      <label className="text-xs font-medium text-slate-500">Editable writable paths (proposal)</label>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {deployment.remote
                          ? 'Saving only stages a proposal on the connected system — click Approve policy (or Save and approve) to enforce it.'
                          : 'Edit runtime paths here, then save as a proposal. Mini must approve before they become enforced.'}
                      </p>
                      <textarea
                        rows={4}
                        value={policyDrafts[deployment.deployment_id] || ''}
                        onChange={(e) =>
                          setPolicyDrafts((prev) => ({ ...prev, [deployment.deployment_id]: e.target.value }))
                        }
                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          runForDeployment(deployment.deployment_id, 'update-policy', {
                            writable_paths: (policyDrafts[deployment.deployment_id] || '')
                              .split(/\r?\n/)
                              .map((line) => line.trim())
                              .filter(Boolean),
                          })
                        }
                        className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Save policy proposal
                      </button>
                      {deployment.remote ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => saveAndApprovePolicy(deployment.deployment_id)}
                            className="mt-2 ml-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
                          >
                            Save and approve
                          </button>
                        </>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {!deployment.remote ? (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runForDeployment(deployment.deployment_id, 'scan')}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Scan now
                          </button>
                          {deployment.status === 'active' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runForDeployment(deployment.deployment_id, 'disable')}
                              className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
                            >
                              Disable
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => runForDeployment(deployment.deployment_id, 'enable')}
                              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                            >
                              Enable
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => runForDeployment(deployment.deployment_id, 'restart-agent')}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Restart agent
                          </button>
                        </>
                      ) : (
                        <p className="text-xs text-slate-500">
                          Scan, enable/disable, and agent restart run on the connected system automatically after kit
                          deploy and app restart.
                        </p>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          if (!window.confirm(`Remove Project Guard from ${deployment.project_name}?`)) return;
                          runForDeployment(deployment.deployment_id, 'remove');
                        }}
                        className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>

                    {(deployment.recent_audit_events || []).length > 0 ? (
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recent audit</p>
                        <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                          {(deployment.recent_audit_events || []).slice(0, 8).map((event, index) => (
                            <div key={`${event.created_at}-${index}`} className="rounded-lg bg-slate-50 px-3 py-2 text-xs">
                              <p className="font-medium text-slate-900">{event.summary || event.event_type}</p>
                              <p className="text-slate-500">{event.created_at}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
