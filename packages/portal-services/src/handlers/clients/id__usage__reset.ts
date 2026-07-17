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

import { Client } from '@web/lib/db';
import { buildUsageInfo } from '@web/lib/clients';
import { USAGE_TYPES } from '@web/lib/client-constants';


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
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const client = await Client.findByPk(id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const type = (body.type as (typeof USAGE_TYPES)[number] | 'all') || 'all';
    const usage: Record<string, number | string> = { ...(client.usageTracking as Record<string, number>) };

    if (type === 'all') {
      usage.onsiteVisitsUsed = 0;
      usage.supportTicketsUsed = 0;
      usage.endpointsUsed = 0;
      usage.supportHoursUsed = 0;
    } else if (USAGE_TYPES.includes(type)) {
      usage[`${type}Used`] = 0;
    } else {
      return { status: 400, body: { success: false, message: 'Invalid usage type' } };
    }

    usage.lastResetDate = new Date().toISOString();
    await client.update({ usageTracking: usage });

    return { status: 200, body: {
      success: true,
      message: 'Usage counters reset',
      usage: buildUsageInfo(usage as Record<string, number>),
    } };
  } catch (error) {
    return authErrorResult(error);
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

