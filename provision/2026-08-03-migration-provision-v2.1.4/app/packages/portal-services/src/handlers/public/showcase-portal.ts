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

import { getShowcasePortalStatus, isShowcaseInstall } from '@web/lib/showcase-dock';


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
  if (isShowcaseInstall()) {
    return { status: 200, body: { success: true, available: false, loginUrl: null, publicUrl: null, showcaseInstall: true }, headers: { 'Cache-Control': 'no-store, max-age=0' } };
  }

  const status = await getShowcasePortalStatus();
  return { status: 200, body: {
      success: true,
      available: status.available,
      loginUrl: status.loginUrl,
      publicUrl: status.publicUrl,
      showcaseInstall: false,
    }, headers: {
        'Cache-Control': 'no-store, max-age=0',
      } };
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

