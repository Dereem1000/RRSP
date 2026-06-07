import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { buildUsageInfo, serializeClient } from '@/lib/clients';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const clients = await Client.findAll({
      where: { isActive: true },
      attributes: ['id', 'companyName', 'name', 'serviceLevel', 'usageTracking'],
      order: [['companyName', 'ASC']],
    });

    const overview = clients.map((client) => ({
      id: client.id,
      companyName: client.companyName || client.name,
      serviceLevel: client.serviceLevel,
      usage: buildUsageInfo(client.usageTracking as Record<string, number>),
    }));

    return NextResponse.json({ success: true, overview });
  } catch (error) {
    return authErrorResponse(error);
  }
}
