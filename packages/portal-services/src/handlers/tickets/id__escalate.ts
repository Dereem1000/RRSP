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

import { Ticket, TicketComment, User } from '@web/lib/db';
import {
  generateCommentId,
  getTicketById,
  serializeTicket,
  userDisplayName,
} from '@web/lib/tickets';
import { notifyTicketEscalated } from '@web/lib/ticket-notifications';
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
    const reason = body.reason?.trim();

    if (!reason) {
      return { status: 400, body: { success: false, message: 'Escalation reason is required' } };
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    const authorName = userDisplayName({ username: session.username });
    const now = new Date().toISOString();

    await TicketComment.create({
      id: generateCommentId(),
      ticketId: id,
      comment: reason,
      commentType: 'escalation',
      authorId: String(session.id),
      authorName,
      timestamp: now,
      isInternal: 0,
      isActive: 1,
    });

    const updates: Record<string, unknown> = {
      lastUpdated: now,
      priority: ticket.priority === 'critical' ? 'critical' : 'high',
      status: ticket.status === 'New' ? IN_PROGRESS_STATUS : ticket.status,
    };

    if (body.escalatedToId) {
      const assignee = await User.findByPk(Number(body.escalatedToId));
      if (!assignee || (assignee.role !== 'technician' && assignee.role !== 'admin')) {
        return { status: 400, body: { success: false, message: 'Invalid escalation target' } };
      }
      updates.assignedTo = assignee.id;
      updates.technician = `${assignee.firstName} ${assignee.lastName}`.trim() || assignee.username;
    }

    await ticket.update(updates);
    const refreshed = await getTicketById(id);
    await notifyTicketEscalated(refreshed ?? ticket, reason, authorName);

    return { status: 200, body: {
      success: true,
      message: 'Ticket escalated successfully',
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

