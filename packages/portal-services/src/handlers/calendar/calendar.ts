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

import { createCalendarEvent, listCalendarEvents } from '@web/lib/calendar';


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

    const searchParams = searchParamsFrom(ctx);
    const from = searchParams.get('from') ?? undefined;
    const to = searchParams.get('to') ?? undefined;
    const includeCompleted = searchParams.get('includeCompleted') === '1';

    const events = await listCalendarEvents({ from, to, includeCompleted });
    return { status: 200, body: { success: true, events } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const body = ctx.body as Record<string, unknown>;
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const scheduledAt = typeof body.scheduledAt === 'string' ? body.scheduledAt : '';

    if (!title) {
      return { status: 400, body: { success: false, message: 'Title is required' } };
    }
    if (!scheduledAt) {
      return { status: 400, body: { success: false, message: 'Scheduled date/time is required' } };
    }

    const event = await createCalendarEvent({
      title,
      notes: typeof body.notes === 'string' ? body.notes : null,
      eventType: typeof body.eventType === 'string' ? body.eventType : 'sales_followup',
      scheduledAt,
      opportunityId: typeof body.opportunityId === 'string' ? body.opportunityId : null,
      clientId: typeof body.clientId === 'string' ? body.clientId : null,
      createdBy: session.id,
    });

    return { status: 200, body: { success: true, event } };
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
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

