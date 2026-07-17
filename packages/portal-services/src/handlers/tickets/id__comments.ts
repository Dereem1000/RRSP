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
  canAccessTicket,
  generateCommentId,
  getTicketById,
  getTicketComments,
  userDisplayName,
} from '@web/lib/tickets';
import { Client } from '@web/lib/db';
import { notifyTicketComment, notifyTicketStatusChange } from '@web/lib/ticket-notifications';


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
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    if (!(await canAccessTicket(ticket, session))) {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const includeInternal = session.role !== 'client';
    let comments = await getTicketComments(id, includeInternal);

    const dateCreated = ticket.dateCreated || '';
    if (
      comments.length === 0 &&
      dateCreated < '2016-01-01' &&
      ticket.notes &&
      String(ticket.notes).trim()
    ) {
      comments = [
        {
          id: 'legacy_notes',
          ticketId: ticket.id,
          comment: ticket.notes,
          commentType: 'general',
          authorId: 'system',
          authorName: 'System (legacy notes)',
          timestamp: ticket.lastUpdated || ticket.dateCreated,
          isInternal: 0,
          isActive: 1,
        } as TicketComment,
      ];
    }

    return { status: 200, body: { success: true, comments } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    const commentText = body.comment?.trim();
    const commentType = body.commentType || 'general';

    if (!commentText) {
      return { status: 400, body: { success: false, message: 'Comment is required' } };
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return { status: 404, body: { success: false, message: 'Ticket not found' } };
    }

    if (!(await canAccessTicket(ticket, session))) {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const user = await User.findByPk(session.id);
    const authorName = userDisplayName(user ?? { username: session.username });
    const isInternal = session.role !== 'client' && Boolean(body.isInternal);
    const now = new Date().toISOString();

    const comment = await TicketComment.create({
      id: generateCommentId(),
      ticketId: id,
      comment: commentText,
      commentType: session.role === 'client' ? 'general' : commentType,
      authorId: String(session.id),
      authorName,
      timestamp: now,
      isInternal: isInternal ? 1 : 0,
      isActive: 1,
    });

    const newStatus = TicketComment.getStatusFromCommentType(
      comment.commentType as Parameters<typeof TicketComment.getStatusFromCommentType>[0]
    );

    const ticketUpdates: Record<string, unknown> = { lastUpdated: now };
    if (newStatus && newStatus !== ticket.status) {
      ticketUpdates.status = newStatus;
    }
    if (session.role === 'client') {
      ticketUpdates.hasUnreadClientComments = true;
      ticketUpdates.lastClientCommentAt = new Date();
    }

    const oldStatus = ticket.status;
    await ticket.update(ticketUpdates);

    const refreshed = await getTicketById(id);
    const updatedTicket = refreshed ?? ticket;

    if (ticketUpdates.status && ticketUpdates.status !== oldStatus) {
      await notifyTicketStatusChange(updatedTicket, authorName, oldStatus);
    }

    let recipientEmail: string | null = null;
    if (session.role === 'client') {
      const assignee = updatedTicket.assignedTo ? await User.findByPk(updatedTicket.assignedTo) : null;
      recipientEmail = assignee?.email ?? null;
    } else if (!isInternal && updatedTicket.clientId) {
      const client = await Client.findByPk(updatedTicket.clientId);
      recipientEmail = client?.email ?? null;
    }

    await notifyTicketComment(updatedTicket, { authorName, comment: commentText, isInternal }, recipientEmail);

    return { status: 201, body: { success: true, comment } };
  } catch (error) {
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

