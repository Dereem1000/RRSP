import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { rejectQuote } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const quote = await rejectQuote(id, body.reason);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Quote rejected', quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reject quote';
    const status = message.includes('Only sent') ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
