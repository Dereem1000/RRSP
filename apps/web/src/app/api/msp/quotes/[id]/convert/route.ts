import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { convertQuoteToInvoice } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const body = await req.json();
    if (!body.dueDate) {
      return NextResponse.json({ success: false, message: 'dueDate is required' }, { status: 400 });
    }

    const result = await convertQuoteToInvoice(id, session.id, {
      dueDate: body.dueDate,
      billingCycle: body.billingCycle,
      paymentGateway: body.paymentGateway,
    });

    if (!result) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Quote converted to invoice',
      quote: result.quote,
      invoice: result.invoice,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to convert quote';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
