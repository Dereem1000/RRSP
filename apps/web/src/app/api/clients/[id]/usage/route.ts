import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { buildUsageInfo, serializeClient } from '@/lib/clients';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const client = await Client.findByPk(id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      usage: buildUsageInfo(client.usageTracking as Record<string, number>),
      serviceLevel: client.serviceLevel,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
