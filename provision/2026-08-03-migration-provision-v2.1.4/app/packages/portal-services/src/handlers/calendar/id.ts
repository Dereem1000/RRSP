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

import { completeCalendarEvent, deleteCalendarEvent } from '@web/lib/calendar';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function PATCHHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const body = (ctx.body ?? {}) as Record<string, unknown>;

    if (body.completed === true) {
      const event = await completeCalendarEvent(id);
      if (!event) {
        return { status: 404, body: { success: false, message: 'Event not found' } };
      }
      return { status: 200, body: { success: true, event } };
    }

    return { status: 400, body: { success: false, message: 'Unsupported update' } };
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
    const result = await deleteCalendarEvent(id);
    if (!result) {
      return { status: 404, body: { success: false, message: 'Event not found' } };
    }

    return { status: 200, body: { success: true, ...result } };
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
    if (method === 'PATCH') return PATCHHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

