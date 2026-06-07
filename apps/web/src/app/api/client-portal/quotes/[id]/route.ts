import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import {
  clientCanAccessQuotes,
  getClientPortalQuote,
  getPortalClient,
} from '@/lib/client-portal-billing';

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

    if (!clientCanAccessQuotes(client.serviceLevel)) {
      return NextResponse.json(
        {
          success: false,
          message:
            'You do not have an active service level. Please contact support to upgrade your service plan to access quotes.',
        },
        { status: 403 }
      );
    }

    const { id } = await params;
    const quote = await getClientPortalQuote(client.id, id);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, quote });
  } catch (error) {
    return authErrorResponse(error);
  }
}
