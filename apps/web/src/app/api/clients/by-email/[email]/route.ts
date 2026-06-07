import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getClientById, serializeClient } from '@/lib/clients';

type RouteParams = { params: Promise<{ email: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    const { email } = await params;
    const decodedEmail = decodeURIComponent(email);

    const client = await Client.findOne({ where: { email: decodedEmail } });
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    if (session.role === 'client' && client.userId !== session.id) {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const full = await getClientById(client.id);
    return NextResponse.json({ success: true, client: serializeClient(full ?? client) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
