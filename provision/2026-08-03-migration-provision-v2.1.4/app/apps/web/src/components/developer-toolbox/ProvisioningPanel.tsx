'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  Package,
  Play,
  RefreshCw,
  XCircle,
} from 'lucide-react';

type ProvisionPackage = {
  name: string;
  path: string;
  has_provision_md?: boolean;
  has_completion?: boolean;
};

type ProvisionRunDefaults = {
  package_path?: string;
  suggested_package_path?: string;
  install_root?: string;
  public_url?: string;
  version?: string;
  customer_name?: string;
};

type ProvisionChecklistItem = {
  id: string;
  phase: string;
  category: string;
  title: string;
  status: string;
  detail?: string;
  automated?: boolean;
};

type ProvisionChecklist = {
  run_id?: string | null;
  standard_version?: string;
  rules?: Array<{ rule: string; label: string; status: string; check_count: number }>;
  items?: ProvisionChecklistItem[];
};

type InstallConnection = {
  connection_id?: string;
  display_label?: string;
  company_name?: string;
  system_name?: string;
  app_base_url?: string;
};

type ProvisionSystem = {
  id: string;
  project_root: string;
  system_name: string;
  system_key?: string;
  has_audit_config?: boolean;
  has_mini_kit?: boolean;
  package_count?: number;
  packages?: ProvisionPackage[];
  latest_run?: { result?: string; phase?: string; run_id?: string };
  recent_runs?: Array<{
    run_id?: string;
    phase?: string;
    result?: string;
    customer_name?: string;
    started_at?: string;
    project_root?: string;
    system_name?: string;
    json_path?: string;
  }>;
  run_defaults?: ProvisionRunDefaults;
  install_connections?: InstallConnection[];
  checklist?: ProvisionChecklist;
};

type ProvisioningPayload = {
  provisioning?: {
    system_count?: number;
    script_available?: boolean;
    checklist_available?: boolean;
    standard_document?: string;
    note?: string;
    systems?: ProvisionSystem[];
    recent_runs?: ProvisionSystem['recent_runs'];
    phases?: string[];
  };
};

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const MINI_OFFLINE_HINT =
  'Cannot reach Mini from Computer Dynamics. Open Settings → Integrations, confirm Mini is docked, and that Local Mini URL matches runtime/dashboard.url in the Mini install folder.';

async function readProvisioningApiJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (text.trimStart().startsWith('<')) {
      throw new Error(MINI_OFFLINE_HINT);
    }
    throw new Error('Unexpected response from the provisioning API.');
  }
}

function provisioningApiError(body: Record<string, unknown>, res: Response, fallback: string): string {
  const err = body.error ?? body.message;
  if (typeof err === 'string' && err.trim()) return err;
  if (res.status === 504 || res.status === 524) {
    return 'Mini took too long to return provisioning data. If Mini was busy, wait a moment and click Refresh.';
  }
  if (res.status === 503) return MINI_OFFLINE_HINT;
  return fallback;
}

function checklistStatusClass(status?: string) {
  const normalized = (status || 'pending').toLowerCase();
  if (normalized === 'pass') return 'bg-emerald-50 text-emerald-700';
  if (normalized === 'fail') return 'bg-red-50 text-red-700';
  if (normalized === 'warn') return 'bg-amber-50 text-amber-800';
  if (normalized === 'skip') return 'bg-slate-100 text-slate-600';
  if (normalized === 'running') return 'bg-indigo-50 text-indigo-800';
  return 'bg-slate-100 text-slate-500';
}

const PROVISION_RUN_STEPS: Record<string, string[]> = {
  Readiness: ['Readiness — rules 1–5 on dev tree'],
  Package: ['Package — folder, layout, and security'],
  Install: ['Install — live site via Mini connection (health, changelog, Mini checks)'],
  Complete: [
    'Readiness — rules 1–5 on dev tree',
    'Package — folder, layout, and security',
  ],
};

function filterInstallConnections(connections: InstallConnection[] = [], customerName = '') {
  const wanted = customerName.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!wanted) return connections;
  return connections.filter((row) => {
    const company = String(row.company_name || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return !company || company === wanted;
  });
}

function provisionPhasesForRun(phase: string) {
  if (phase === 'Complete') return ['Readiness', 'Package'];
  return [phase];
}

function buildRunningChecklist(
  templateItems: ProvisionChecklistItem[],
  phase: string,
  progressStep: number,
): ProvisionChecklist {
  const phases = provisionPhasesForRun(phase);
  const activePhase = phases[Math.min(progressStep, phases.length - 1)] ?? phase;
  const items = templateItems.map((item) => {
    if (item.phase === activePhase) {
      return { ...item, status: 'running', detail: 'Checking…' };
    }
    return { ...item, status: 'pending', detail: '' };
  });
  return {
    run_id: null,
    standard_version: '',
    rules: [],
    items,
  };
}

function resultBadge(result?: string) {
  const normalized = (result || '').toUpperCase();
  if (normalized === 'PASSED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> PASSED
      </span>
    );
  }
  if (normalized === 'PASSED_WITH_WARNINGS') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
        <AlertTriangle className="h-3.5 w-3.5" /> WARNINGS
      </span>
    );
  }
  if (normalized === 'FAILED') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        <XCircle className="h-3.5 w-3.5" /> FAILED
      </span>
    );
  }
  return <span className="text-xs text-slate-500">{result || '—'}</span>;
}

function formatKitInstallMessage(body: Record<string, unknown>): string {
  const mini = (body.mini || {}) as { actions?: string[]; skipped?: boolean; note?: string };
  const license = (body.license || {}) as { actions?: string[]; skipped?: boolean; note?: string };
  const provision = (body.provision || {}) as { actions?: string[] };
  const manualSteps = Array.isArray(body.manual_steps) ? body.manual_steps.filter((s) => typeof s === 'string') : [];
  const parts: string[] = [];
  const root = String((body.system as { project_root?: string } | undefined)?.project_root || body.project_root || '').trim();
  if (root) parts.push(`Product folder: ${root}`);
  if (mini.actions?.length) parts.push(`Mini kit: ${mini.actions.join(', ')}`);
  else if (mini.skipped) parts.push(`Mini kit: skipped (${mini.note || 'already present'})`);
  if (license.actions?.length) parts.push(`License kit: ${license.actions.join(', ')}`);
  else if (license.skipped) parts.push(`License kit: skipped (${license.note || 'already present'})`);
  if (provision.actions?.length) parts.push(`Provision scripts: ${provision.actions.length} updated`);
  if (manualSteps.length) {
    parts.push(`Next: ${manualSteps[0]}`);
  }
  parts.push(
    'Install kits updates the local dev product folder on Mini — not the live site. ' +
      'After kit files are in place, rebuild the provision package and run Install, ' +
      'or push the kit from Mini → Connected Systems once apply-update is wired on the server.',
  );
  return parts.join(' · ');
}

function dedupeProvisionSystems(systems: ProvisionSystem[] = []) {
  const unique: ProvisionSystem[] = [];
  const seen = new Set<string>();
  for (const system of systems) {
    const key = system.id || system.project_root;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(system);
  }
  return unique;
}

type ProvisionRunRow = NonNullable<ProvisionSystem['recent_runs']>[number];

function mergeProvisionRuns(
  globalRuns: ProvisionRunRow[] = [],
  systemRuns: ProvisionRunRow[] = [],
  fallbackRoot = '',
  fallbackName = '',
) {
  const merged: ProvisionRunRow[] = [];
  const seen = new Set<string>();
  for (const row of [...globalRuns, ...systemRuns]) {
    const runId = row.run_id?.trim();
    if (!runId) continue;
    const projectRoot =
      row.project_root?.trim() ||
      projectRootFromAuditJson(row.json_path) ||
      fallbackRoot;
    if (!projectRoot) continue;
    const key = `${runId}:${projectRoot}:${row.started_at || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...row,
      run_id: runId,
      project_root: projectRoot,
      system_name: row.system_name || fallbackName || projectRoot,
    });
  }
  return merged.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
}

function projectRootFromAuditJson(jsonPath?: string) {
  const normalized = String(jsonPath || '').replace(/\//g, '\\');
  const marker = '\\provision\\audit-runs\\';
  const idx = normalized.toLowerCase().indexOf(marker);
  if (idx > 0) return normalized.slice(0, idx);
  return '';
}

function reportSelectionKey(projectRoot: string, runId: string) {
  return `${runId}::${projectRoot}`;
}

export function ProvisioningPanel() {
  const [data, setData] = useState<ProvisioningPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [selectedRoot, setSelectedRoot] = useState('');
  const [phase, setPhase] = useState('Complete');
  const [customerName, setCustomerName] = useState('');
  const [packagePath, setPackagePath] = useState('');
  const [installRoot, setInstallRoot] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [version, setVersion] = useState('');
  const [allowWarnings, setAllowWarnings] = useState(false);
  const [skipReadiness, setSkipReadiness] = useState(false);
  const [registerPath, setRegisterPath] = useState('');
  const [registerLabel, setRegisterLabel] = useState('');
  const [reportMarkdown, setReportMarkdown] = useState('Run a provision gate from Mini to see the audit report here.');
  const [selectedReportKey, setSelectedReportKey] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const reportPanelRef = useRef<HTMLDivElement | null>(null);
  const [checklistOverride, setChecklistOverride] = useState<ProvisionChecklist | null>(null);
  const [runProgressStep, setRunProgressStep] = useState(0);

  const prov = data?.provisioning;
  const systems = dedupeProvisionSystems(prov?.systems ?? []);
  const activeSystem = systems.find((s) => s.project_root === selectedRoot) ?? systems[0];
  const displayChecklist = checklistOverride ?? activeSystem?.checklist;
  const runSteps = PROVISION_RUN_STEPS[phase] ?? ['Running provision gate…'];
  const showConnectionField = phase === 'Install' && !installRoot.trim();
  const installConnections = filterInstallConnections(
    activeSystem?.install_connections ?? [],
    customerName,
  );

  const applyRunDefaults = useCallback((system?: ProvisionSystem | null, force = false) => {
    const defaults = system?.run_defaults;
    if (!defaults) return;
    const pick = (current: string, next?: string) => {
      if (!next) return current;
      return force || !current.trim() ? next : current;
    };
    const projectRoot = system?.project_root || '';
    const packageVersionMismatch = (pathValue: string) => {
      const current = pathValue.trim();
      if (!current || !defaults.version) return false;
      const match = current.match(/-provision-v([\d.]+)/i);
      return Boolean(match && match[1] !== defaults.version);
    };
    const packageDefault =
      defaults.package_path &&
      defaults.package_path.toLowerCase().includes(`${projectRoot.replace(/\\/g, '/').toLowerCase()}/provision/`) &&
      /\d{4}-\d{2}-\d{2}-provision-v/i.test(defaults.package_path)
        ? defaults.package_path
        : undefined;
    setPackagePath((current) => {
      if (force || !current.trim() || packageVersionMismatch(current)) {
        return packageDefault || defaults.suggested_package_path || '';
      }
      return current;
    });
    setInstallRoot((current) => pick(current, defaults.install_root));
    setPublicUrl((current) => pick(current, defaults.public_url));
    if (defaults.version) {
      setVersion(defaults.version);
    }
    setCustomerName((current) => pick(current, defaults.customer_name));
  }, []);

  useEffect(() => {
    applyRunDefaults(activeSystem);
    if (activeSystem?.project_root) {
      setRegisterPath(activeSystem.project_root);
      if (activeSystem.system_name) {
        setRegisterLabel(activeSystem.system_name);
      }
    }
  }, [activeSystem?.id, activeSystem?.run_defaults, activeSystem?.project_root, activeSystem?.system_name, applyRunDefaults]);

  useEffect(() => {
    if (!showConnectionField) return;
    if (connectionId && installConnections.some((row) => row.connection_id === connectionId)) return;
    if (installConnections.length === 1 && installConnections[0]?.connection_id) {
      setConnectionId(installConnections[0].connection_id);
      const url = installConnections[0].app_base_url?.trim();
      if (url) setPublicUrl((current) => current.trim() || url);
    }
  }, [showConnectionField, installConnections, connectionId, activeSystem?.id]);

  const load = useCallback(async (attempt = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/developer-toolbox/provisioning', { credentials: 'include' });
      const body = await readProvisioningApiJson(res);
      if ((res.status === 504 || res.status === 524) && attempt < 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 2500));
        return load(attempt + 1);
      }
      if (!res.ok || body.error) {
        throw new Error(
          provisioningApiError(body, res, 'Failed to load provisioning data from Mini'),
        );
      }
      const payload = body as ProvisioningPayload;
      setData(payload);
      const nextSystems = payload.provisioning?.systems ?? [];
      setSelectedRoot((prev) => {
        if (prev && nextSystems.some((s: ProvisionSystem) => s.project_root === prev)) return prev;
        return nextSystems[0]?.project_root ?? '';
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadReport = useCallback(async (projectRoot: string, runId: string) => {
    const root = projectRoot.trim();
    const id = runId.trim();
    if (!root || !id) {
      throw new Error('project_root and run_id are required to load a report.');
    }
    const qs = new URLSearchParams({ project_root: root, run_id: id });
    const res = await fetch(`/api/developer-toolbox/provisioning?${qs.toString()}`, {
      credentials: 'include',
    });
    const body = await readProvisioningApiJson(res);
    if (!res.ok || body.error) {
      throw new Error(provisioningApiError(body, res, 'Failed to load report'));
    }
    setReportMarkdown(
      String(body.report_markdown || JSON.stringify(body.meta ?? body, null, 2)),
    );
    setSelectedReportKey(reportSelectionKey(root, id));
    reportPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, []);

  const viewReport = useCallback(
    async (projectRoot: string, runId: string) => {
      setReportLoading(true);
      setError(null);
      try {
        await loadReport(projectRoot, runId);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load report');
      } finally {
        setReportLoading(false);
      }
    },
    [loadReport],
  );

  const recentRuns = mergeProvisionRuns(
    prov?.recent_runs ?? [],
    activeSystem?.recent_runs ?? [],
    activeSystem?.project_root ?? selectedRoot,
    activeSystem?.system_name,
  );

  useEffect(() => {
    setSelectedReportKey(null);
  }, [activeSystem?.id]);

  useEffect(() => {
    if (selectedReportKey) return;
    const latest = recentRuns[0];
    if (!latest?.run_id || !latest.project_root) return;
    void loadReport(latest.project_root, latest.run_id).catch(() => {
      setReportMarkdown('Could not load the latest audit report from Mini.');
    });
  }, [activeSystem?.id, recentRuns, loadReport, selectedReportKey]);

  useEffect(() => {
    if (busy !== 'run') return undefined;
    const steps = PROVISION_RUN_STEPS[phase] ?? [];
    if (steps.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setRunProgressStep((current) => {
        const next = Math.min(current + 1, steps.length - 1);
        const template = activeSystem?.checklist?.items ?? [];
        if (template.length) {
          setChecklistOverride(buildRunningChecklist(template, phase, next));
        }
        return next;
      });
    }, 12000);
    return () => window.clearInterval(timer);
  }, [busy, phase, activeSystem?.checklist?.items]);

  const runAudit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedRoot) {
      setError('Select a system first.');
      return;
    }
    const templateItems = activeSystem?.checklist?.items ?? [];
    setRunProgressStep(0);
    if (templateItems.length) {
      setChecklistOverride(buildRunningChecklist(templateItems, phase, 0));
    } else {
      setChecklistOverride({ run_id: null, items: [], rules: [], standard_version: '' });
    }
    setBusy('run');
    setError(null);
    setMessage(null);
    try {
      const runBody: Record<string, unknown> = {
        action: 'run',
        project_root: selectedRoot,
        phase,
        customer_name: customerName,
        package_path: packagePath,
        version,
        allow_warnings: allowWarnings,
        skip_readiness: skipReadiness,
      };
      // Full gate (Complete) is readiness + package only — install fields trigger remote health
      // probes and fail before the customer site exists (see provision-audit.ps1 Complete phase).
      if (phase === 'Install') {
        runBody.install_root = installRoot;
        runBody.connection_id = connectionId;
        runBody.public_url = publicUrl;
      }

      const res = await fetch('/api/developer-toolbox/provisioning', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(runBody),
      });
      const body = await readProvisioningApiJson(res);
      if (!res.ok || body.error) {
        throw new Error(provisioningApiError(body, res, 'Provision run failed'));
      }
      setMessage(`Result: ${String(body.result || 'done')} (exit ${body.exit_code ?? '?'})`);
      const report = body.report as { report_markdown?: string } | undefined;
      if (report?.report_markdown) {
        setReportMarkdown(report.report_markdown);
      } else if (body.stdout) {
        setReportMarkdown([String(body.stdout), body.stderr ? String(body.stderr) : ''].filter(Boolean).join('\n\n'));
      }
      if (body.provisioning) setData({ provisioning: body.provisioning as ProvisioningPayload['provisioning'] });
      else await load();
      const latestRun = body.latest_run as
        | { run_id?: string; project_root?: string; json_path?: string }
        | undefined;
      if (latestRun?.run_id) {
        const reportRoot =
          latestRun.project_root?.trim() ||
          projectRootFromAuditJson(latestRun.json_path) ||
          selectedRoot;
        if (reportRoot) {
          setSelectedReportKey(reportSelectionKey(reportRoot, latestRun.run_id));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provision run failed');
    } finally {
      setChecklistOverride(null);
      setRunProgressStep(0);
      setBusy(null);
    }
  };

  const pickProductFolder = async () => {
    if (busy === 'pick') return;
    setBusy('pick');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/developer-toolbox/provisioning', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pick-folder' }),
      });
      const body = await readProvisioningApiJson(res);
      if (body.cancelled) return;
      if (!res.ok || body.error) {
        throw new Error(provisioningApiError(body, res, 'Folder picker failed'));
      }
      const resolved = String(body.project_path || body.project_root || body.source_path || '').trim();
      if (!resolved) throw new Error('No folder was selected.');
      setRegisterPath(resolved);
      setSelectedRoot(resolved);
      setMessage(`Product root: ${resolved}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Folder picker failed');
    } finally {
      setBusy(null);
    }
  };

  const registerSystem = async () => {
    if (!registerPath.trim()) {
      setError('Project root is required.');
      return;
    }
    if (busy === 'register') return;
    setBusy('register');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/developer-toolbox/provisioning', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'register',
          project_root: registerPath.trim(),
          label: registerLabel.trim(),
        }),
      });
      const body = await readProvisioningApiJson(res);
      if (!res.ok || body.error) {
        throw new Error(provisioningApiError(body, res, 'Register failed'));
      }
      setMessage('System registered on Mini.');
      const kits = body.kits as { mini?: { actions?: unknown[] }; license?: { actions?: unknown[] } } | undefined;
      if (kits?.mini?.actions?.length || kits?.license?.actions?.length) {
        setMessage('System registered. Provisioning kits installed or updated.');
      }
      if (body.provisioning) setData({ provisioning: body.provisioning as ProvisioningPayload['provisioning'] });
      const system = body.system as { project_root?: string; run_defaults?: ProvisionSystem['run_defaults'] } | undefined;
      if (system?.project_root) {
        setSelectedRoot(system.project_root);
        applyRunDefaults(system as ProvisionSystem, true);
      } else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Register failed');
    } finally {
      setBusy(null);
    }
  };

  const installKits = async () => {
    const root = registerPath.trim() || selectedRoot;
    if (!root) {
      setError('Select a system from the list or enter the product root path (e.g. E:\\CRM).');
      return;
    }
    setBusy('kits');
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/developer-toolbox/provisioning', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'install-kits',
          project_root: root,
          force: true,
        }),
      });
      const body = await readProvisioningApiJson(res);
      if (!res.ok || body.error) {
        const detail =
          provisioningApiError(
            body,
            res,
            res.status === 404 ? 'Restart the Mini dashboard server, then try again.' : 'Kit install failed',
          );
        throw new Error(detail);
      }
      if (body.ok === false && typeof body.error === 'string') {
        throw new Error(body.error);
      }
      setMessage(formatKitInstallMessage(body));
      if (body.provisioning) setData({ provisioning: body.provisioning as ProvisioningPayload['provisioning'] });
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kit install failed');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading provisioning from Mini…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Package className="h-5 w-5 text-indigo-600" />
            Customer Provisioning
          </h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
              <strong className="text-slate-800">{systems.length}</strong> systems
            </span>
            <span
              className={`rounded-full px-2.5 py-1 font-medium ${
                prov?.script_available ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
              }`}
            >
              Script {prov?.script_available ? 'ready' : 'missing'}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1">
              Latest: {resultBadge(activeSystem?.latest_run?.result)}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy === 'refresh' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <p className="text-sm text-slate-600">
        Run <code className="rounded bg-slate-100 px-1">provision-audit.ps1</code> on the docked Mini instance.
        Pick the customer product root (CRM, POS, etc.) — reports land in{' '}
        <code className="rounded bg-slate-100 px-1">provision/audit-runs/</code>.
      </p>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      )}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="grid w-full gap-4 xl:w-7/12 xl:grid-cols-7 xl:items-stretch">
          <form
            onSubmit={runAudit}
            className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-span-4"
          >
            <h3 className="font-semibold text-slate-900">Run provision gate</h3>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <label className="block text-sm sm:col-span-2 xl:col-span-1">
                <span className="mb-1 block font-medium text-slate-700">System</span>
                <select className={inputClass} value={selectedRoot} onChange={(e) => setSelectedRoot(e.target.value)}>
                  <option value="">— Select system —</option>
                  {systems.map((system) => (
                    <option key={system.id} value={system.project_root}>
                      {system.system_name}
                      {system.system_key ? ` (${system.system_key})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm sm:col-span-2 xl:col-span-1">
                <span className="mb-1 block font-medium text-slate-700">Provision gate</span>
                <select className={inputClass} value={phase} onChange={(e) => setPhase(e.target.value)}>
                  <option value="Complete">Full gate — readiness + package before ship</option>
                  <option value="Readiness">Readiness only — rules 1–5 on dev tree</option>
                  <option value="Package">Package only — scan provision folder</option>
                  <option value="Install">Install only — live site after customer install</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Customer name</span>
                <input className={inputClass} value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-slate-700">Version</span>
                <input className={inputClass} value={version} onChange={(e) => setVersion(e.target.value)} />
              </label>
              <label className="block text-sm sm:col-span-2 xl:col-span-1">
                <span className="mb-1 block font-medium text-slate-700">Package path</span>
                <input
                  className={inputClass}
                  value={packagePath}
                  placeholder={activeSystem?.run_defaults?.suggested_package_path || 'Build provision package first (Step 1)'}
                  onChange={(e) => setPackagePath(e.target.value)}
                />
                {!packagePath.trim() && activeSystem?.run_defaults?.suggested_package_path && (
                  <span className="mt-1 block text-xs text-slate-500">
                    No package folder yet — build at{' '}
                    <code className="rounded bg-slate-100 px-1">{activeSystem.run_defaults.suggested_package_path}</code>
                    {' '}(or leave Package path empty and run Full gate to auto-build)
                  </span>
                )}
                {packagePath.trim() && (
                  <span className="mt-1 block text-xs text-slate-500">
                    Auditing package: <code className="rounded bg-slate-100 px-1">{packagePath}</code>
                  </span>
                )}
              </label>
              <label className="block text-sm sm:col-span-2 xl:col-span-1">
                <span className="mb-1 block font-medium text-slate-700">Install root</span>
                <input
                  className={inputClass}
                  placeholder="Leave empty for remote Install gate via Mini connection"
                  value={installRoot}
                  onChange={(e) => setInstallRoot(e.target.value)}
                />
              </label>
              {showConnectionField && (
                <label className="block text-sm sm:col-span-2 xl:col-span-1">
                  <span className="mb-1 block font-medium text-slate-700">Mini connection</span>
                  <select
                    className={inputClass}
                    value={connectionId}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setConnectionId(nextId);
                      const match = installConnections.find((row) => row.connection_id === nextId);
                      if (match?.app_base_url?.trim()) {
                        setPublicUrl(match.app_base_url.trim());
                      }
                    }}
                  >
                    <option value="">— Select accepted connection —</option>
                    {installConnections.map((row) => (
                      <option key={row.connection_id} value={row.connection_id}>
                        {row.display_label ||
                          `${row.company_name || 'Customer'} (${row.system_name || 'System'})`}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Customer copies the provision folder, runs install-provision, connects Mini — then
                    run <strong>Install</strong> or <strong>Full gate</strong> here. Checklist Install
                    and Mini steps update from the live site.
                  </span>
                  {installConnections.length === 0 && (
                    <span className="mt-1 block text-xs text-amber-700">
                      No accepted Mini connections match this product yet.
                    </span>
                  )}
                </label>
              )}
              <label className="block text-sm sm:col-span-2 xl:col-span-1">
                <span className="mb-1 block font-medium text-slate-700">Public URL</span>
                <input
                  className={inputClass}
                  placeholder="Auto-filled from Mini connection"
                  value={publicUrl}
                  onChange={(e) => setPublicUrl(e.target.value)}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-slate-700">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={allowWarnings} onChange={(e) => setAllowWarnings(e.target.checked)} />
                Allow warnings
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={skipReadiness} onChange={(e) => setSkipReadiness(e.target.checked)} />
                Skip readiness
              </label>
            </div>
            <button
              type="submit"
              disabled={!!busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
            >
              {busy === 'run' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run provision gate
            </button>
          </form>

          <div className="flex min-h-0 flex-col gap-4 overflow-hidden xl:col-span-3">
            <div className="shrink-0 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="font-semibold text-slate-900">Register system</h3>
              <p className="text-xs text-slate-500">
                Pick the customer product root on this computer (e.g. <code className="rounded bg-slate-100 px-1">E:\CRM</code>
                ). Use <strong className="font-medium text-slate-700">Register</strong>{' '}
                once for a new product folder. For kit updates on a system already in the list, select it above or type
                the path, then use <strong className="font-medium text-slate-700">Install kits</strong> — this
                re-runs <code className="rounded bg-slate-100 px-1">integrate-mini.ps1</code> on that folder (not the
                live server URL).
              </p>
              <div className="flex gap-2">
                <input
                  className={inputClass}
                  placeholder="Product root — use Pick folder"
                  value={registerPath}
                  onChange={(e) => setRegisterPath(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => void pickProductFolder()}
                  disabled={!!busy}
                  title="Select customer product root on this computer"
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  {busy === 'pick' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                  Pick
                </button>
              </div>
              <input
                className={inputClass}
                placeholder="Label (optional)"
                value={registerLabel}
                onChange={(e) => setRegisterLabel(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void registerSystem()}
                  disabled={!!busy}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Register
                </button>
                <button
                  type="button"
                  onClick={() => void installKits()}
                  disabled={!!busy}
                  className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                >
                  {busy === 'kits' ? 'Installing…' : 'Install kits'}
                </button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="shrink-0 font-semibold text-slate-900">Packages</h3>
              <ul className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto text-sm">
                {(activeSystem?.packages ?? []).length === 0 && (
                  <li className="text-slate-500">
                    No provision packages yet. Build per CUSTOMER_PROVISIONING.md Step 1
                    {activeSystem?.run_defaults?.suggested_package_path && (
                      <>
                        {' '}
                        — suggested:{' '}
                        <code className="rounded bg-slate-100 px-1 text-xs">
                          {activeSystem.run_defaults.suggested_package_path}
                        </code>
                      </>
                    )}
                    .
                  </li>
                )}
                {(activeSystem?.packages ?? []).map((pkg) => (
                  <li key={pkg.path} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                    <p className="font-medium text-slate-800">{pkg.name}</p>
                    <p className="truncate text-xs text-slate-500">{pkg.path}</p>
                    <button
                      type="button"
                      className="mt-1 text-xs font-medium text-indigo-600 hover:underline"
                      onClick={() => setPackagePath(pkg.path)}
                    >
                      Use as package path
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex w-full flex-col gap-4 xl:w-5/12">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Recent runs</h3>
              <span className="text-xs text-slate-500">{recentRuns.length} total</span>
            </div>
            <ul className="mt-2 max-h-32 divide-y divide-slate-100 overflow-y-auto">
              {recentRuns.length === 0 && (
                <li className="py-2 text-sm text-slate-500">No provision audit runs yet for this system.</li>
              )}
              {recentRuns.slice(0, 16).map((row) => {
                const rowKey = reportSelectionKey(row.project_root || '', row.run_id || '');
                const isSelected = selectedReportKey === rowKey;
                return (
                <li
                  key={`${row.run_id}-${row.started_at}`}
                  className={`flex flex-wrap items-center justify-between gap-2 py-2 text-sm${
                    isSelected ? ' rounded-lg bg-indigo-50/80 px-2 -mx-2' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{row.system_name || row.project_root}</p>
                    <p className="truncate text-xs text-slate-500">
                      {row.phase}
                      {row.customer_name ? ` · ${row.customer_name}` : ''} · {row.started_at}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {resultBadge(row.result)}
                    {row.run_id && row.project_root && (
                      <button
                        type="button"
                        className={`text-xs font-medium hover:underline ${
                          isSelected ? 'text-indigo-800' : 'text-indigo-600'
                        }`}
                        disabled={reportLoading}
                        onClick={() => void viewReport(row.project_root!, row.run_id!)}
                      >
                        {reportLoading && isSelected ? 'Loading…' : 'View'}
                      </button>
                    )}
                  </div>
                </li>
              );
              })}
            </ul>
          </div>

          <div ref={reportPanelRef} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Audit report</h3>
              {selectedReportKey && (
                <span className="text-xs text-slate-500">{selectedReportKey.split('::')[0]}</span>
              )}
            </div>
            <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100 whitespace-pre-wrap">
              {reportLoading ? 'Loading report…' : reportMarkdown}
            </pre>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-slate-900">Provisioning checklist</h3>
              {displayChecklist?.run_id && !checklistOverride && (
                <span className="text-xs text-slate-500">Latest audit: {displayChecklist.run_id}</span>
              )}
              {checklistOverride && (
                <span className="text-xs font-medium text-indigo-700">Audit in progress…</span>
              )}
            </div>
            {!activeSystem && (
              <p className="mt-2 text-sm text-slate-500">Select a system to view checklist status.</p>
            )}
            {activeSystem && (
              <>
                {busy === 'run' && (
                  <div className="mt-2 space-y-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2">
                    <p className="text-xs font-medium text-indigo-900">Provision gate running</p>
                    {runSteps.map((label, index) => (
                      <p
                        key={label}
                        className={`text-xs ${
                          index < runProgressStep
                            ? 'text-slate-500'
                            : index === runProgressStep
                              ? 'font-medium text-indigo-800'
                              : 'text-slate-400'
                        }`}
                      >
                        {index < runProgressStep ? '✓' : index === runProgressStep ? '…' : '○'} {label}
                      </p>
                    ))}
                  </div>
                )}
                {(displayChecklist?.rules ?? []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(displayChecklist?.rules ?? []).map((rule) => (
                      <span
                        key={rule.rule}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${checklistStatusClass(rule.status)}`}
                      >
                        {rule.rule}: {rule.label} · {rule.status.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}
                {!displayChecklist?.run_id && !checklistOverride && (
                  <p className="mt-2 text-sm text-slate-500">
                    No audit run yet — run a provision gate to populate check status.
                  </p>
                )}
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {(['Readiness', 'Package', 'Install'] as const).map((phaseName) => {
                    const items = (displayChecklist?.items ?? []).filter((item) => item.phase === phaseName);
                    if (items.length === 0) return null;
                    return (
                      <div key={phaseName} className="min-w-0">
                        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{phaseName}</h4>
                        <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-100">
                          {items.map((item) => (
                            <li
                              key={item.id}
                              className="flex items-start justify-between gap-2 px-2.5 py-1.5 text-xs"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-medium text-slate-800">{item.title}</p>
                                {item.detail && <p className="truncate text-[11px] text-slate-500">{item.detail}</p>}
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${checklistStatusClass(item.status)}`}
                              >
                                {item.status.toUpperCase()}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
