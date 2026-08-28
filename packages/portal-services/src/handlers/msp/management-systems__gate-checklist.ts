// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import {
  getMiniProvisioningReadGateError,
  MINI_PROVISIONING_READ_TIMEOUT_MS,
  miniProxyRequest,
} from '@web/lib/mini-dock';

function normalizeProjectRoot(value: string): string {
  return value.replace(/\//g, '\\').toLowerCase().replace(/\\+$/, '');
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function pickChecklist(
  reportBody: Record<string, unknown>,
  system: Record<string, unknown> | undefined,
  runId: string,
) {
  const fromReport = reportBody.checklist ?? asRecord(reportBody.provisioning).checklist;
  if (fromReport && typeof fromReport === 'object') return fromReport;

  const systemChecklist = asRecord(system?.checklist);
  if (String(systemChecklist.run_id || '').trim() === runId) {
    return systemChecklist;
  }

  return null;
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const projectRoot = String(ctx.query.projectRoot || ctx.query.project_root || '').trim();
    const runId = String(ctx.query.runId || ctx.query.run_id || '').trim();
    if (!projectRoot || !runId) {
      return {
        status: 400,
        body: { success: false, message: 'projectRoot and runId are required' },
      };
    }

    const miniGate = await getMiniProvisioningReadGateError();
    if (miniGate) {
      return { status: 503, body: { success: false, message: miniGate } };
    }

    const readOptions = {
      timeoutMs: MINI_PROVISIONING_READ_TIMEOUT_MS,
      updateOnlineCache: false as const,
    };

    const reportQs = new URLSearchParams({ project_root: projectRoot, run_id: runId });
    const [reportResult, provResult] = await Promise.all([
      miniProxyRequest(`/api/provisioning/run-report?${reportQs.toString()}`, { method: 'GET' }, readOptions),
      miniProxyRequest('/api/provisioning', { method: 'GET' }, readOptions),
    ]);

    if (!reportResult.ok) {
      const errBody = asRecord(reportResult.body);
      return {
        status: reportResult.status || 502,
        body: {
          success: false,
          message: String(errBody.error || errBody.message || 'Failed to load run report from Mini'),
        },
      };
    }

    const reportBody = asRecord(reportResult.body);
    const provBody = asRecord(provResult.body);
    const provisioning = asRecord(provBody.provisioning);
    const systems = Array.isArray(provisioning.systems) ? provisioning.systems : [];
    const wantedRoot = normalizeProjectRoot(projectRoot);
    const system = systems.find(
      (row) => normalizeProjectRoot(String(asRecord(row).project_root || '')) === wantedRoot,
    );
    const systemRecord = system ? asRecord(system) : undefined;

    const checklist = pickChecklist(reportBody, systemRecord, runId);
    const result = reportBody.audit_result ?? reportBody.result ?? '';
    const reportMarkdown = String(reportBody.report_markdown || '');

    return {
      status: 200,
      body: {
        success: true,
        runId,
        projectRoot,
        result,
        reportMarkdown,
        checklist,
        systemName: systemRecord?.system_name || null,
      },
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  if (ctx.method.toUpperCase() === 'GET') return GETHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
