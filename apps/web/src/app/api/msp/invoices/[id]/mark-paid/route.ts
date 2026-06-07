import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { markInvoicePaid, sendInvoiceEmail } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const invoice = await markInvoicePaid(id, session.id, {
      paymentDate: body.paymentDate,
      paymentMethod: body.paymentMethod,
      paymentNotes: body.paymentNotes,
    });

    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }

    if (body.sendEmail === true) {
      const origin = req.headers.get('origin') ?? undefined;
      sendInvoiceEmail(id, { origin, type: 'paid' }).catch((err) => console.error('[INVOICE PAID EMAIL]', err));
    }

    return NextResponse.json({ success: true, message: 'Invoice marked as paid', invoice });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already')) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    return authErrorResponse(error);
  }
}
