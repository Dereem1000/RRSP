import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { createInvoice, listMspInvoices, sendInvoiceEmail } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { searchParams } = req.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);
    const status = searchParams.get('status') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;

    const result = await listMspInvoices({ page, limit, status, clientId });
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
    const invoice = await createInvoice({
      clientId: String(body.clientId),
      amount: Number(body.amount),
      currency: body.currency,
      dueDate: String(body.dueDate),
      createdBy: session.id,
      billingCycle: body.billingCycle,
      paymentGateway: body.paymentGateway,
      description: body.description ?? null,
      items: body.items ?? [],
      status: body.status,
    });

    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Failed to create invoice' }, { status: 500 });
    }

    if (body.sendEmail) {
      const origin = req.headers.get('origin') ?? undefined;
      sendInvoiceEmail(invoice.id, { origin, type: 'created' }).catch((err) =>
        console.error('[INVOICE CREATE EMAIL]', err)
      );
    }

    return NextResponse.json({ success: true, message: 'Invoice created', invoice }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create invoice';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
