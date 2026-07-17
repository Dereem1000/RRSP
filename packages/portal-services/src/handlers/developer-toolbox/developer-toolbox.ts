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

import { getToolboxState, saveSlots } from '@web/lib/developer-toolbox/store';
import { requireToolboxAdmin } from './auth';


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
    const state = await getToolboxState();
    return { status: 200, body: { success: true, ...state } };
  } catch (e) {
    return authErrorResult(e);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireToolboxAdmin(ctx);
    const body = ctx.body as Record<string, unknown>;
    const slots = await saveSlots(body.slots ?? []);
    const state = await getToolboxState();
    return { status: 200, body: { success: true, ...state, slots } };
  } catch (e) {
    return authErrorResult(e);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

