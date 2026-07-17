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
import {
  canAccessTicket,
  getTicketById,
  resolveClientForTicket,
  resolveTechnicianName,
  serializeTicket,
  userDisplayName,
} from '@web/lib/tickets';
import { emitMiniCdEvent } from '@web/lib/mini-cd-events.server';
import { pickTicketFields } from '@web/lib/ticket-payload';
import { notifyTicketStatusChange } from '@web/lib/ticket-notifications';


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
    requireRole(session, 'admin', 'technician', 'client');

    const { id } = ctx.params;
    const ticket = await getTicketById(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    if (!(await canAccessTicket(ticket, session))) {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    if (ticket.hasUnreadClientComments && session.role !== 'client') {
      await ticket.update({ hasUnreadClientComments: false });
    }

    return { status: 200, body: { success: true, ticket: serializeTicket(ticket) } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const updates: Record<string, unknown> = {
      ...pickTicketFields(body, 'update'),
      lastUpdated: new Date().toISOString(),
    };

    if (typeof body.clientId === 'string' && body.clientId.trim()) {
      try {
        const resolved = await resolveClientForTicket({
          clientId: body.clientId.trim(),
          clientName: body.clientName as string,
        });
        updates.clientId = resolved.clientId;
        updates.clientName = resolved.clientName;
        if (!body.clientContactNumber) updates.clientContactNumber = resolved.clientContactNumber;
      } catch {
        return { status: 400, body: { success: false, message: 'Client not found' } };
      }
    }

    if (body.assignedTo !== undefined) {
      const assignedTo = body.assignedTo ? Number(body.assignedTo) : null;
      updates.assignedTo = assignedTo;
      updates.technician = await resolveTechnicianName(assignedTo, body.technician);
    } else if (body.technician !== undefined) {
      updates.technician = body.technician;
    }

    const oldStatus = ticket.status;
    await ticket.update(updates);
    const refreshed = await getTicketById(id);
    const updated = refreshed ?? ticket;

    if (updates.status && updates.status !== oldStatus) {
      await notifyTicketStatusChange(updated, userDisplayName({ username: session.username }), oldStatus);
    }

    const serialized = serializeTicket(updated);
    const statusChanged = updates.status && updates.status !== oldStatus;
    emitMiniCdEvent(session, {
      type: statusChanged && String(updates.status).toLowerCase().includes('resolved') ? 'ticket.resolved' : 'ticket.updated',
      summary: statusChanged
        ? `Updated ticket #${serialized.ticketNumber} status to ${serialized.status}`
        : `Updated ticket #${serialized.ticketNumber} for ${serialized.clientName}`,
      entityType: 'ticket',
      entityId: String(serialized.id),
      href: `/tickets/${serialized.id}`,
      clientId: serialized.clientId ? String(serialized.clientId) : undefined,
      clientName: serialized.clientName ? String(serialized.clientName) : undefined,
      actorName: userDisplayName({ username: session.username }),
      metadata: statusChanged ? { fromStatus: oldStatus, toStatus: String(serialized.status) } : undefined,
    });

    return { status: 200, body: { success: true, ticket: serialized } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const { id } = ctx.params;
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    await ticket.update({ isActive: 0, lastUpdated: new Date().toISOString() });
    return { status: 200, body: { success: true, message: 'Ticket archived' } };
  } catch (error) {
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

