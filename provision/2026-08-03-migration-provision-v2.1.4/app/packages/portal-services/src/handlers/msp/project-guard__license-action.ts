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
  applyProjectGuardLicenseAction,
  type ProjectGuardLicenseActionRequest,
} from '@web/lib/project-guard-license-action';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    await requireMspApiAuth(ctx);

    const body = (ctx.body as Record<string, unknown>) as ProjectGuardLicenseActionRequest;
    if (body.action !== 'deactivate' && body.action !== 'reactivate') {
      return { status: 400, body: { success: false, message: 'action must be deactivate or reactivate' } };
    }

    const result = await applyProjectGuardLicenseAction(body);
    const status = result.success ? 200 : result.mspClientId ? 200 : 404;
    return { status: 200, body: result };
  } catch (error) {
    return mspAuthErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

