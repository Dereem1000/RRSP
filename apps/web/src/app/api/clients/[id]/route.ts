import { NextRequest, NextResponse } from 'next/server';
import { Client, Ticket } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  forceDeleteClient,
  getClientById,
  mergeUsageLimitsForServiceLevel,
  resolveUniqueEmail,
  serializeClient,
  validateTechnicianAssignment,
} from '@/lib/clients';
import { pickClientFields } from '@/lib/client-payload';
import { getDefaultMonthlyRate, getDefaultSlaForLevel } from '@/lib/client-constants';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const client = await getClientById(id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, client: serializeClient(client) });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const client = await Client.findByPk(id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const body = await req.json();
    if (body.email && body.email !== client.email) {
      if (!(await resolveUniqueEmail(body.email, id))) {
        return NextResponse.json({ success: false, message: 'Email already in use' }, { status: 400 });
      }
    }

    const updates = pickClientFields(body);
    if (body.serviceLevel === '') updates.serviceLevel = null;

    if (body.assignedTechnicianId !== undefined) {
      updates.assignedTechnicianId = await validateTechnicianAssignment(body.assignedTechnicianId);
    }

    if (body.servicePlanData !== undefined) {
      updates.servicePlanData = {
        ...(client.servicePlanData as Record<string, unknown>),
        ...(body.servicePlanData as Record<string, unknown>),
      };
    }

    if (
      updates.serviceLevel !== undefined &&
      updates.serviceLevel !== client.serviceLevel
    ) {
      if (!body.usageTracking) {
        updates.usageTracking = mergeUsageLimitsForServiceLevel(
          client.usageTracking as Record<string, unknown>,
          updates.serviceLevel as string | null
        );
      }
      if (!body.slaAgreement) {
        updates.slaAgreement = getDefaultSlaForLevel(updates.serviceLevel as string | null);
      }
      if (body.monthlyRate === undefined) {
        const rate = getDefaultMonthlyRate(updates.serviceLevel as string | null);
        if (rate != null) updates.monthlyRate = rate;
      }
    }

    await client.update(updates);
    const refreshed = await getClientById(id);
    return NextResponse.json({ success: true, client: serializeClient(refreshed ?? client) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid technician assignment') {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const client = await Client.findByPk(id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const force = req.nextUrl.searchParams.get('force') === 'true';
    const ticketCount = await Ticket.count({ where: { clientId: id } });

    if (force) {
      const result = await forceDeleteClient(id);
      return NextResponse.json({
        success: true,
        message: `Client permanently deleted${result.ticketCount ? ` along with ${result.ticketCount} tickets` : ''}.`,
      });
    }

    if (ticketCount > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Client has ${ticketCount} associated tickets. Deactivate instead, or add ?force=true to delete everything.`,
          ticketCount,
        },
        { status: 400 }
      );
    }

    await client.update({ isActive: false, status: 'inactive' });
    return NextResponse.json({ success: true, message: 'Client deactivated' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
