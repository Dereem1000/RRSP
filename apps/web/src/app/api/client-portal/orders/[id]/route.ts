import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getPortalClient } from '@/lib/client-portal-billing';
import { getClientPortalOrder } from '@/lib/orders';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    if (session.role !== 'client') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client record not found' }, { status: 404 });
    }

    const { id } = await params;
    const order = await getClientPortalOrder(client.id, id);
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    return authErrorResponse(error);
  }
}
