import { NextRequest, NextResponse } from 'next/server';
import { Ticket } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { generateCommentId, getTicketById, serializeTicket, userDisplayName } from '@/lib/tickets';
import { notifyTicketResolved } from '@/lib/ticket-notifications';
import { TicketComment } from '@/lib/db';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const body = await req.json();
    const resolution = body.resolution?.trim();

    if (!resolution) {
      return NextResponse.json({ success: false, message: 'Resolution notes are required' }, { status: 400 });
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
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

    return NextResponse.json({
      success: true,
      message: 'Ticket resolved successfully',
      ticket: serializeTicket(refreshed ?? ticket),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
