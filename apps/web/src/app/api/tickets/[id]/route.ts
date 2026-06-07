import { NextRequest, NextResponse } from 'next/server';
import { Ticket } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  canAccessTicket,
  getTicketById,
  resolveClientForTicket,
  resolveTechnicianName,
  serializeTicket,
  userDisplayName,
} from '@/lib/tickets';
import { pickTicketFields } from '@/lib/ticket-payload';
import { notifyTicketStatusChange } from '@/lib/ticket-notifications';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    const { id } = await params;
    const ticket = await getTicketById(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    if (!(await canAccessTicket(ticket, session))) {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    if (ticket.hasUnreadClientComments && session.role !== 'client') {
      await ticket.update({ hasUnreadClientComments: false });
    }

    return NextResponse.json({ success: true, ticket: serializeTicket(ticket) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    const body = await req.json();
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
        return NextResponse.json({ success: false, message: 'Client not found' }, { status: 400 });
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

    return NextResponse.json({ success: true, ticket: serializeTicket(updated) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const ticket = await Ticket.findByPk(id);
    if (!ticket) {
      return NextResponse.json({ success: false, message: 'Ticket not found' }, { status: 404 });
    }

    await ticket.update({ isActive: 0, lastUpdated: new Date().toISOString() });
    return NextResponse.json({ success: true, message: 'Ticket archived' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
