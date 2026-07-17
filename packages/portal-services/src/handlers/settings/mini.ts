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

import { getMiniDockSettings, probeMiniHealth, saveMiniDockSettings } from '@web/lib/mini-dock';


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
    const session = requireSession(ctx);
    requireRole(session, 'admin');
    const settings = await getMiniDockSettings();
    return { status: 200, body: { success: true, settings } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    if (body.action === 'test') {
      const probe = await probeMiniHealth();
      return { status: 200, body: { success: probe.ok, probe } };
    }
    return { status: 400, body: { success: false, message: 'Unknown action' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');
    const body = ctx.body as Record<string, unknown>;
    const result = await saveMiniDockSettings({
      docked: Boolean(body.docked),
      installPath: String(body.installPath ?? ''),
      localUrl: body.localUrl ? String(body.localUrl) : undefined,
      publicUrl: body.publicUrl ? String(body.publicUrl) : undefined,
      startWithCd: body.startWithCd !== false,
      port: body.port ? Number(body.port) : undefined,
      regenerateToken: Boolean(body.regenerateToken),
      apiToken: body.apiToken ? String(body.apiToken) : undefined,
    });
    return { status: 200, body: {
      success: true,
      settings: result.settings,
      apiToken: result.apiToken,
      message: result.settings.docked ? 'Mini dock settings saved' : 'Mini dock settings cleared',
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Mini settings';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

