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

import { acknowledgeAlerts, applyToolbox, clearSlot, DeveloperToolboxError, getToolboxState } from '@web/lib/developer-toolbox/store';
import { runHealthChecks } from '@web/lib/developer-toolbox/health';
import type { DevSlotId } from '@web/lib/developer-toolbox/types';
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


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireToolboxAdmin(ctx);
    const { id } = ctx.params;
    const slotId = id as DevSlotId;
    if (!['dev1', 'dev2', 'dev3'].includes(slotId)) {
      return { status: 400, body: { success: false, message: 'Invalid slot' } };
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const action = String(body.action || 'clear');

    if (action === 'clear') {
      const slots = await clearSlot(slotId);
      const result = await applyToolbox(slots);
      const health = await runHealthChecks(slots);
      const state = await getToolboxState();
      return { status: 200, body: {
        success: true,
        message: `Cleared ${slotId} and applied tunnel.\n${result.message}`,
        ...state,
        health,
      } };
    }

    return { status: 400, body: { success: false, message: 'Unknown action' } };
  } catch (e) {
    if (e instanceof DeveloperToolboxError) {
      return { status: 502, body: { success: false, message: e.message } };
    }
    return authErrorResult(e);
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

