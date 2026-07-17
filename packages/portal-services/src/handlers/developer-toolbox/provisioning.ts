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
  MINI_PROVISIONING_RUN_TIMEOUT_MS,
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


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireToolboxAdmin(ctx);
    const miniGate = await getMiniProvisioningReadGateError();
    if (miniGate) return { status: 503, body: { success: false, error: miniGate } };
    const searchParams = searchParamsFrom(ctx);
    const projectRoot = searchParams.get('project_root')?.trim();
    const runId = searchParams.get('run_id')?.trim();
    const readOptions = { timeoutMs: MINI_PROVISIONING_READ_TIMEOUT_MS, updateOnlineCache: false as const };
    if (projectRoot && runId) {
      const qs = new URLSearchParams({ project_root: projectRoot, run_id: runId });
      const result = await miniProxyRequest(`/api/provisioning/run-report?${qs.toString()}`, {
        method: 'GET',
      }, readOptions);
      return { status: 200, body: { success: result.ok, ...(typeof result.body === 'object' ? result.body : { body: result.body }) } };
    }
    const result = await miniProxyRequest('/api/provisioning', { method: 'GET' }, readOptions);
    return { status: 200, body: { success: result.ok, ...(typeof result.body === 'object' ? result.body : { body: result.body }) } };
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
        : body;
    const proxyOptions =
      action === 'run'
        ? { timeoutMs: MINI_PROVISIONING_RUN_TIMEOUT_MS, updateOnlineCache: false }
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
    return { status: 200, body: { success: result.ok, ...(typeof result.body === 'object' ? result.body : { body: result.body }) } };
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

