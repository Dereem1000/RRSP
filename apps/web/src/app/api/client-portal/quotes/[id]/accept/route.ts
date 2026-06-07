import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import {
  acceptClientPortalQuote,
  clientCanAccessQuotes,
  getPortalClient,
} from '@/lib/client-portal-billing';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    if (session.role !== 'client') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client record not found' }, { status: 404 });
    }

    if (!clientCanAccessQuotes(client.serviceLevel)) {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const { id } = await params;
    const quote = await acceptClientPortalQuote(client.id, id);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Quote accepted', quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to accept quote';
    const status = message.includes('Only sent') || message.includes('expired') ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
