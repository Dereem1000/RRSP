import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  getClientActivities,
  getClientInvoices,
  getClientOrders,
  getClientQuotes,
} from '@/lib/clients';

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

    const [activities, invoices, orders, quotes] = await Promise.all([
      getClientActivities(id),
      getClientInvoices(id),
      getClientOrders(id),
      getClientQuotes(id),
    ]);

    return NextResponse.json({
      success: true,
      activities,
      invoices,
      orders,
      quotes,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
