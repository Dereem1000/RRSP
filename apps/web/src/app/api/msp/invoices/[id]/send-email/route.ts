import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { sendInvoiceEmail } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const origin = req.headers.get('origin') ?? undefined;
    const invoice = await sendInvoiceEmail(id, {
      clientEmail: body.clientEmail,
      origin,
      type: body.type ?? 'created',
    });
    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Invoice email sent', invoice, emailSent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send invoice email';
    const status = message.includes('email') ? 400 : 500;
    return NextResponse.json({ success: false, message }, { status });
  }
}
