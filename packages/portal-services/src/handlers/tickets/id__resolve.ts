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
import { generateCommentId, getTicketById, serializeTicket, userDisplayName } from '@web/lib/tickets';
import { emitMiniCdEvent } from '@web/lib/mini-cd-events.server';
import { notifyTicketResolved } from '@web/lib/ticket-notifications';
import { TicketComment } from '@web/lib/db';


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
    const resolution = body.resolution?.trim();

    if (!resolution) {
      return { status: 400, body: { success: false, message: 'Resolution notes are required' } };
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    const now = new Date().toISOString();
    const authorName = userDisplayName({ username: session.username });

    await TicketComment.create({
      id: generateCommentId(),
      ticketId: id,
      comment: resolution,
      commentType: 'resolution',
      authorId: String(session.id),
      authorName,
      timestamp: now,
      isInternal: 0,
      isActive: 1,
    });

    await ticket.update({
      status: 'Completed',
      notes: ticket.notes ? `${ticket.notes}\n\n[Resolution] ${resolution}` : resolution,
      resolutionNotes: resolution,
      actualHours: body.actualHours != null && body.actualHours !== '' ? Number(body.actualHours) : ticket.actualHours,
      lastUpdated: now,
    });

    const refreshed = await getTicketById(id);
    await notifyTicketResolved(refreshed ?? ticket, resolution);

    const serialized = serializeTicket(refreshed ?? ticket);
    emitMiniCdEvent(session, {
      type: 'ticket.resolved',
      summary: `Resolved ticket #${serialized.ticketNumber} for ${serialized.clientName}`,
      entityType: 'ticket',
      entityId: String(serialized.id),
      href: `/tickets/${serialized.id}`,
      clientId: serialized.clientId ? String(serialized.clientId) : undefined,
      clientName: serialized.clientName ? String(serialized.clientName) : undefined,
      actorName: authorName,
    });

    return { status: 200, body: {
      success: true,
      message: 'Ticket resolved successfully',
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

