import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getPortalClient, listClientPortalInvoices } from '@/lib/client-portal-billing';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== 'client') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client record not found' }, { status: 404 });
    }

    const { searchParams } = req.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);
    const status = searchParams.get('status') ?? undefined;

    const result = await listClientPortalInvoices(client.id, { page, limit, status });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
