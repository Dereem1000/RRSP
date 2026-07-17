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

import { Ticket } from '@web/lib/db';
import { canAccessTicket, userDisplayName } from '@web/lib/tickets';
import { resendTicketUpdateToClient } from '@web/lib/ticket-notifications';
import { emitMiniCdEvent } from '@web/lib/mini-cd-events.server';


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
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    if (!(await canAccessTicket(ticket, session))) {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const authorName = userDisplayName({ username: session.username });
    const result = await resendTicketUpdateToClient(ticket, authorName);
    if (!result.ok) {
      return { status: 400, body: { success: false, message: result.error } };
    }

    emitMiniCdEvent(session, {
      type: 'ticket.updated',
      summary: `Resent ticket #${result.ticketNumber} update email to ${result.email}`,
      entityType: 'ticket',
      entityId: id,
      href: `/tickets/${id}`,
      clientId: ticket.clientId ? String(ticket.clientId) : undefined,
      clientName: ticket.clientName ? String(ticket.clientName) : undefined,
      actorName: authorName,
    });

    return { status: 200, body: {
      success: true,
      message: `Ticket update resent to ${result.email}`,
      email: result.email,
      ticketNumber: result.ticketNumber,
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

