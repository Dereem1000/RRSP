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

import { getMiniDockSettings, getMiniOnlineSnapshot, isMiniDockConfigured, resolveMiniLocalBaseUrl, resolveMiniProxyBaseUrls } from '@web/lib/mini-dock';


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
    requireSession(ctx);
    const configured = await isMiniDockConfigured();
    const settings = await getMiniDockSettings();
    if (!configured) {
      return { status: 200, body: {
        success: true,
        configured: false,
        online: false,
        active: false,
        settings,
      } };
    }
    const { online: probedOnline } = getMiniOnlineSnapshot();
    const online = probedOnline || (Boolean(settings.lastSeenAt) && !settings.lastError);
    const proxyBases = configured ? resolveMiniProxyBaseUrls(settings) : [];
    return { status: 200, body: {
      success: true,
      configured: true,
      online,
      active: online,
      proxyBases,
      proxyMode: settings.installPath.trim() ? 'localhost-only' : 'tunnel-first',
      localMiniUrl: configured ? resolveMiniLocalBaseUrl(settings) : null,
      settings: {
        docked: settings.docked,
        localUrl: settings.localUrl,
        publicUrl: settings.publicUrl,
        connected: settings.connected,
        lastSeenAt: settings.lastSeenAt,
        lastError: settings.lastError,
      },
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

