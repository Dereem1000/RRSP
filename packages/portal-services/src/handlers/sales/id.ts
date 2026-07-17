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

import { getOpportunityById, markOpportunityLost, updateOpportunity } from '@web/lib/sales';


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
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const opportunity = await getOpportunityById(id);
    if (!opportunity) {
      return { status: 404, body: { success: false, message: 'Opportunity not found' } };
    }

    return { status: 200, body: { success: true, opportunity } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    const opportunity = await updateOpportunity(id, body);
    if (!opportunity) {
      return { status: 404, body: { success: false, message: 'Opportunity not found' } };
    }

    return { status: 200, body: { success: true, opportunity } };
  } catch (error) {
    if (error instanceof Error) {
      return { status: 400, body: { success: false, message: error.message } };
    }
    return authErrorResult(error);
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const lostReason = body.lostReason?.trim() || 'Archived from pipeline';

    const opportunity = await markOpportunityLost(id, lostReason);
    if (!opportunity) {
      return { status: 404, body: { success: false, message: 'Opportunity not found' } };
    }

    return { status: 200, body: { success: true, opportunity } };
  } catch (error) {
    if (error instanceof Error) {
      return { status: 400, body: { success: false, message: error.message } };
    }
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

