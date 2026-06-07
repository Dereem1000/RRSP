import { NextRequest, NextResponse } from 'next/server';
import { Ticket, TicketComment, User } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  generateCommentId,
  getTicketById,
  serializeTicket,
  userDisplayName,
} from '@/lib/tickets';
import { notifyTicketEscalated } from '@/lib/ticket-notifications';
import { IN_PROGRESS_STATUS } from '@/lib/ticket-constants';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const body = await req.json();
    const reason = body.reason?.trim();

    if (!reason) {
      return NextResponse.json({ success: false, message: 'Escalation reason is required' }, { status: 400 });
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
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
        return NextResponse.json({ success: false, message: 'Invalid escalation target' }, { status: 400 });
      }
      updates.assignedTo = assignee.id;
      updates.technician = `${assignee.firstName} ${assignee.lastName}`.trim() || assignee.username;
    }

    await ticket.update(updates);
    const refreshed = await getTicketById(id);
    await notifyTicketEscalated(refreshed ?? ticket, reason, authorName);

    return NextResponse.json({
      success: true,
      message: 'Ticket escalated successfully',
      ticket: serializeTicket(refreshed ?? ticket),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
