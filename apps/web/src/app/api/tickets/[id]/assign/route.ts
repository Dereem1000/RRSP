import { NextRequest, NextResponse } from 'next/server';
import { Ticket, User } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getTicketById, resolveTechnicianName, serializeTicket } from '@/lib/tickets';
import { notifyTicketAssigned } from '@/lib/ticket-notifications';
import { IN_PROGRESS_STATUS } from '@/lib/ticket-constants';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const body = await req.json();
    const assignedTo = Number(body.assignedTo);

    if (!assignedTo) {
      return NextResponse.json({ success: false, message: 'assignedTo is required' }, { status: 400 });
    }

    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const technician = await User.findByPk(assignedTo);
    if (!technician || (technician.role !== 'technician' && technician.role !== 'admin')) {
      return NextResponse.json({ success: false, message: 'Invalid technician' }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      message: 'Ticket assigned successfully',
      ticket: serializeTicket(refreshed ?? ticket),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
