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

import { Op } from 'sequelize';
import { Ticket, Client } from '@web/lib/db';
import { OPEN_STATUSES, RESOLVED_STATUSES, IN_PROGRESS_STATUSES } from '@web/lib/ticket-constants';


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
    const where: Record<string, unknown> = { isActive: 1 };

    if (session.role === 'client') {
      const client = await Client.findOne({ where: { userId: session.id } });
      if (!client) {
        return { status: 200, body: {
          success: true,
          stats: { total: 0, open: 0, resolved: 0, inProgress: 0, pending: 0 },
        } };
      }
      where.clientId = client.id;
    } else if (session.role === 'technician') {
      where.assignedTo = session.id;
    }

    const [total, open, resolved, inProgress, pending] = await Promise.all([
      Ticket.count({ where }),
      Ticket.count({ where: { ...where, status: { [Op.in]: OPEN_STATUSES } } }),
      Ticket.count({ where: { ...where, status: { [Op.in]: RESOLVED_STATUSES } } }),
      Ticket.count({ where: { ...where, status: { [Op.in]: IN_PROGRESS_STATUSES } } }),
      Ticket.count({ where: { ...where, status: 'Pending' } }),
    ]);

    return { status: 200, body: {
      success: true,
      stats: { total, open, resolved, inProgress, pending },
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

