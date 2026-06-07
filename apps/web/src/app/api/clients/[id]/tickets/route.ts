import { NextRequest, NextResponse } from 'next/server';
import { Ticket } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { serializeTicket } from '@/lib/tickets';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const tickets = await Ticket.findAll({
      where: { clientId: id, isActive: 1 },
      order: [['lastUpdated', 'DESC']],
      limit: 50,
    });

    return NextResponse.json({
      success: true,
      tickets: tickets.map(serializeTicket),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
