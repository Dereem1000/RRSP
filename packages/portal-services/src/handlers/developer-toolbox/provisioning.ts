// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import {
  getMiniProvisioningGateError,
  getMiniProvisioningReadGateError,
  MINI_PROVISIONING_PICK_TIMEOUT_MS,
  MINI_PROVISIONING_READ_TIMEOUT_MS,
  MINI_PROVISIONING_RUN_START_TIMEOUT_MS,
  MINI_PROVISIONING_RUN_STATUS_TIMEOUT_MS,
  miniProxyRequest,
} from '@web/lib/mini-dock';
import { requireMiniForProvisioning, requireToolboxAdmin } from './auth';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}

const SERVER_RUN_WAIT_MS = 95_000;
const SERVER_RUN_POLL_INTERVAL_MS = 3_000;

function normalizeMiniRunStatusBody(body: Record<string, unknown>): Record<string, unknown> {
  const auditResult = body.audit_result ?? body.result;
  return {
    ...body,
    audit_result: auditResult,
    result: auditResult,
  };
}

async function waitForMiniProvisionJob(
  jobId: string,
  deadlineMs: number,
): Promise<Record<string, unknown> | null> {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    const qs = new URLSearchParams({ job_id: jobId });
    const result = await miniProxyRequest(
      `/api/provisioning/run-status?${qs.toString()}`,
      { method: 'GET' },
      { timeoutMs: MINI_PROVISIONING_RUN_STATUS_TIMEOUT_MS, updateOnlineCache: false },
    );
    const payload =
      typeof result.body === 'object' && result.body !== null
        ? (result.body as Record<string, unknown>)
        : {};
    const status = String(payload.status || '').toLowerCase();
    if (status === 'completed' || status === 'failed') {
      return normalizeMiniRunStatusBody(payload);
    }
    await new Promise((resolve) => setTimeout(resolve, SERVER_RUN_POLL_INTERVAL_MS));
  }
  return null;
}

function buildAsyncRunStartBody(miniBody: Record<string, unknown>): Record<string, unknown> {
  return {
    success: true,
    accepted: true,
    job_id: miniBody.job_id,
    status: miniBody.status || 'running',
    project_root: miniBody.project_root,
    phase: miniBody.phase,
    note: miniBody.note,
  };
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireToolboxAdmin(ctx);
    const miniGate = await getMiniProvisioningReadGateError();
    if (miniGate) return { status: 503, body: { success: false, error: miniGate } };
    const searchParams = searchParamsFrom(ctx);
    const projectRoot = searchParams.get('project_root')?.trim();
    const runId = searchParams.get('run_id')?.trim();
    const jobId = searchParams.get('job_id')?.trim();
    const readOptions = { timeoutMs: MINI_PROVISIONING_READ_TIMEOUT_MS, updateOnlineCache: false as const };
    if (jobId) {
      const qs = new URLSearchParams({ job_id: jobId });
      const result = await miniProxyRequest(
        `/api/provisioning/run-status?${qs.toString()}`,
        { method: 'GET' },
        { timeoutMs: MINI_PROVISIONING_RUN_STATUS_TIMEOUT_MS, updateOnlineCache: false },
      );
      const payload =
        typeof result.body === 'object' && result.body !== null
          ? (result.body as Record<string, unknown>)
          : { body: result.body };
      return {
        status: result.ok ? 200 : result.status || 502,
        body: { success: result.ok, ...payload },
      };
    }
    if (projectRoot && runId) {
      const qs = new URLSearchParams({ project_root: projectRoot, run_id: runId });
      const result = await miniProxyRequest(`/api/provisioning/run-report?${qs.toString()}`, {
        method: 'GET',
      }, readOptions);
      return { status: 200, body: { success: result.ok, ...(typeof result.body === 'object' ? result.body : { body: result.body }) } };
    }
    const result = await miniProxyRequest('/api/provisioning', { method: 'GET' }, readOptions);
    const payload =
      typeof result.body === 'object' && result.body !== null
        ? (result.body as Record<string, unknown>)
        : { body: result.body };
    // Pass through Mini proxy status so the UI can distinguish timeout/busy vs offline.
    return {
      status: result.ok ? 200 : result.status || 502,
      body: { success: result.ok, ...payload },
    };
  } catch (e) {
    return authErrorResult(e);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireToolboxAdmin(ctx);
    const miniGate = await requireMiniForProvisioning();
    if (miniGate) return miniGate;
    const body = ctx.body as Record<string, unknown>;
    const action = String(body.action || 'register').trim();
    if (action === 'pick-folder') {
      const result = await miniProxyRequest(
        '/api/provisioning/pick-folder',
        {
          method: 'POST',
          body: JSON.stringify({}),
        },
        { timeoutMs: MINI_PROVISIONING_PICK_TIMEOUT_MS, updateOnlineCache: false },
      );
      return { status: 200, body: { success: result.ok, ...(typeof result.body === 'object' ? result.body : { body: result.body }) } };
    }
    const path =
      action === 'run'
        ? '/api/provisioning/run'
        : action === 'install-kits'
          ? '/api/provisioning/install-kits'
          : '/api/provisioning/register';
    const proxyBody =
      action === 'install-kits'
        ? {
            project_root: body.project_root,
            force: body.force !== false,
          }
        : action === 'run'
          ? (() => {
              const { action: _action, client_poll: _clientPoll, wait: _wait, ...runFields } = body;
              return { ...runFields, async: true };
            })()
          : body;
    const proxyOptions =
      action === 'run'
        ? { timeoutMs: MINI_PROVISIONING_RUN_START_TIMEOUT_MS, updateOnlineCache: false }
        : action === 'install-kits'
          ? { timeoutMs: 180_000, updateOnlineCache: false }
          : undefined;
    const result = await miniProxyRequest(
      path,
      {
        method: 'POST',
        body: JSON.stringify(proxyBody),
      },
      proxyOptions,
    );
    const miniBody =
      typeof result.body === 'object' && result.body !== null
        ? (result.body as Record<string, unknown>)
        : { raw: result.body };
    if (action === 'run' && miniBody.accepted && miniBody.job_id) {
      const jobId = String(miniBody.job_id);
      const clientPoll = body.client_poll === true;
      if (!clientPoll) {
        const completed = await waitForMiniProvisionJob(jobId, SERVER_RUN_WAIT_MS);
        if (completed) {
          return {
            status: 200,
            body: { success: true, ...completed },
          };
        }
        return {
          status: 200,
          body: {
            ...buildAsyncRunStartBody(miniBody),
            result: 'RUNNING_ON_MINI',
            audit_pending: true,
            message:
              'Provision audit is still running on Mini. Click Refresh in a few minutes, or hard-refresh this page (Ctrl+Shift+R) to load the polling UI.',
          },
        };
      }
      return {
        status: 202,
        body: buildAsyncRunStartBody(miniBody),
      };
    }
    return {
      status: result.ok ? 200 : result.status || 502,
      body: { success: result.ok, ...miniBody },
    };
  } catch (e) {
    return authErrorResult(e);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

