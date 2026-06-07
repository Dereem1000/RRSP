import { NextRequest, NextResponse } from 'next/server';
import { Ticket, TicketComment, User } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  canAccessTicket,
  generateCommentId,
  getTicketById,
  getTicketComments,
  userDisplayName,
} from '@/lib/tickets';
import { Client } from '@/lib/db';
import { notifyTicketComment, notifyTicketStatusChange } from '@/lib/ticket-notifications';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    const { id } = await params;
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    if (!(await canAccessTicket(ticket, session))) {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
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

    return NextResponse.json({ success: true, comments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    const { id } = await params;
    const body = await req.json();
    const commentText = body.comment?.trim();
    const commentType = body.commentType || 'general';

    if (!commentText) {
      return NextResponse.json({ success: false, message: 'Comment is required' }, { status: 400 });
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    if (!(await canAccessTicket(ticket, session))) {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
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

    return NextResponse.json({ success: true, comment }, { status: 201 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
