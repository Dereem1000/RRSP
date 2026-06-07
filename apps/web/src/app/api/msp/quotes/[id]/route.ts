import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { deleteQuote, getQuoteById, updateQuote } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const quote = await getQuoteById(id);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, quote });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const body = await req.json();
    const quote = await updateQuote(id, body);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Quote updated', quote });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update quote';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin');

    const { id } = await params;
    const deleted = await deleteQuote(id);
    if (!deleted) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Quote deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete quote';
    const status = message.includes('Cannot delete') ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
