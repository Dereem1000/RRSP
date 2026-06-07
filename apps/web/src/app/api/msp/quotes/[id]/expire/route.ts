import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { expireQuote } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin');

    const { id } = await params;
    const quote = await expireQuote(id);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Quote expired', quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to expire quote';
    const status = message.includes('Only draft') ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
