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
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const client = await Client.findByPk(id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const type = body.type as (typeof USAGE_TYPES)[number];
    const amount = Number(body.amount ?? 1);

    if (!USAGE_TYPES.includes(type)) {
      return { status: 400, body: { success: false, message: 'Invalid usage type' } };
    }
    if (Number.isNaN(amount) || amount < 0) {
      return { status: 400, body: { success: false, message: 'Invalid amount' } };
    }

    const usage = { ...(client.usageTracking as Record<string, number>) };
    const usedKey = `${type}Used`;
    const limitKey = `${type}Limit`;
    const currentUsed = Number(usage[usedKey] ?? 0);
    const limit = Number(usage[limitKey] ?? 0);

    if (limit > 0 && currentUsed + amount > limit) {
      return { status: 400, body: {
          success: false,
          message: `Usage limit exceeded. Current: ${currentUsed}, limit: ${limit}, requested: ${amount}`,
        } };
    }

    usage[usedKey] = currentUsed + amount;
    await client.update({ usageTracking: usage });

    return { status: 200, body: {
      success: true,
      message: `${type} usage updated`,
      usage: buildUsageInfo(usage),
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

