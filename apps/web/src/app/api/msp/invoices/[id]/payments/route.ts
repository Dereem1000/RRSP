import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { addInvoicePayment, listInvoicePayments, sendInvoiceEmail } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const payments = await listInvoicePayments(id);
    return NextResponse.json({ success: true, payments });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const body = await req.json();

    const result = await addInvoicePayment(id, session.id, {
      amount: Number(body.amount),
      paymentMethod: body.paymentMethod,
      reference: body.reference,
      notes: body.notes,
      paymentDate: body.paymentDate,
    });

    if (!result) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }

    if (body.sendEmail === true) {
      const origin = req.headers.get('origin') ?? undefined;
      const emailType = result.invoice?.status === 'paid' ? 'paid' : 'partial';
      sendInvoiceEmail(id, {
        origin,
        type: emailType,
        paymentAmount: Number(body.amount),
      }).catch((err) => console.error('[INVOICE PAYMENT EMAIL]', err));
    }

    return NextResponse.json({
      success: true,
      message: 'Payment added',
      invoice: result.invoice,
      payment: result.payment,
      remainingBalance: result.remainingBalance,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

