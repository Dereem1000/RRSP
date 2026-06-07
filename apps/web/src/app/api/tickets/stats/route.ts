import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { Ticket, Client } from '@/lib/db';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { OPEN_STATUSES, RESOLVED_STATUSES, IN_PROGRESS_STATUSES } from '@/lib/ticket-constants';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    const where: Record<string, unknown> = { isActive: 1 };

    if (session.role === 'client') {
      const client = await Client.findOne({ where: { userId: session.id } });
      if (!client) {
        return NextResponse.json({
          success: true,
          stats: { total: 0, open: 0, resolved: 0, inProgress: 0, pending: 0 },
        });
      }
      where.clientId = client.id;
    } else if (session.role === 'technician') {
      where.assignedTo = session.id;
    }

    const [total, open, resolved, inProgress, pending] = await Promise.all([
      Ticket.count({ where }),
      Ticket.count({ where: { ...where, status: { [Op.in]: OPEN_STATUSES } } }),
      Ticket.count({ where: { ...where, status: { [Op.in]: RESOLVED_STATUSES } } }),
      Ticket.count({ where: { ...where, status: { [Op.in]: IN_PROGRESS_STATUSES } } }),
      Ticket.count({ where: { ...where, status: 'Pending' } }),
    ]);

    return NextResponse.json({
      success: true,
      stats: { total, open, resolved, inProgress, pending },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
