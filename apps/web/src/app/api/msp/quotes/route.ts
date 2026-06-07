import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { createQuote, listQuotes } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { searchParams } = req.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);
    const status = searchParams.get('status') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;

    const result = await listQuotes({ page, limit, status, clientId });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    if (!body.clientId || !body.title || body.amount == null || !body.validUntil) {
      return NextResponse.json(
        { success: false, message: 'clientId, title, amount, and validUntil are required' },
        { status: 400 }
      );
    }

    const quote = await createQuote({
      clientId: body.clientId,
      title: body.title,
      amount: Number(body.amount),
      validUntil: body.validUntil,
      createdBy: session.id,
      items: body.items,
      description: body.description,
      terms: body.terms,
      notes: body.notes,
      status: body.status,
    });

    return NextResponse.json({ success: true, message: 'Quote created', quote }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create quote';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
