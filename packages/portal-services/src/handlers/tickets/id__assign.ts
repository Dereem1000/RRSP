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

import { Ticket, User } from '@web/lib/db';
import { getTicketById, resolveTechnicianName, serializeTicket } from '@web/lib/tickets';
import { notifyTicketAssigned } from '@web/lib/ticket-notifications';
import { IN_PROGRESS_STATUS } from '@web/lib/ticket-constants';


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
    const body = ctx.body as Record<string, unknown>;
    const assignedTo = Number(body.assignedTo);

    if (!assignedTo) {
      return { status: 400, body: { success: false, message: 'assignedTo is required' } };
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    const technician = await User.findByPk(assignedTo);
    if (!technician || (technician.role !== 'technician' && technician.role !== 'admin')) {
      return { status: 400, body: { success: false, message: 'Invalid technician' } };
    }

    const technicianName = await resolveTechnicianName(assignedTo);
    await ticket.update({
      assignedTo,
      technician: technicianName,
      status: ticket.status === 'New' ? IN_PROGRESS_STATUS : ticket.status,
      lastUpdated: new Date().toISOString(),
    });

    const refreshed = await getTicketById(id);
    await notifyTicketAssigned(refreshed ?? ticket, technician);

    return { status: 200, body: {
      success: true,
      message: 'Ticket assigned successfully',
      ticket: serializeTicket(refreshed ?? ticket),
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

