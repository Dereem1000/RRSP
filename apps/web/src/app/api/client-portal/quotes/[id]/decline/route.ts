import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import {
  clientCanAccessQuotes,
  declineClientPortalQuote,
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
    const body = await req.json().catch(() => ({}));
    const quote = await declineClientPortalQuote(client.id, id, body.reason);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Quote declined', quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to decline quote';
    const status = message.includes('Only sent') ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
