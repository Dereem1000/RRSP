import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getClientPortalInvoice, getPortalClient } from '@/lib/client-portal-billing';
import { createWiPayPaymentUrl } from '@/lib/wipay';
import { getWiPaySettings, isWiPayConfigured } from '@/lib/wipay-settings';
import { getRequestPublicOrigin } from '@/lib/site-url';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    if (session.role !== 'client') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const settings = await getWiPaySettings();
    if (!isWiPayConfigured(settings)) {
      return NextResponse.json(
        { success: false, message: 'Online payments are not available right now.' },
        { status: 503 }
      );
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client record not found' }, { status: 404 });
    }

    const { id } = await params;
    const invoice = await getClientPortalInvoice(client.id, id);
    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }

    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      return NextResponse.json({ success: false, message: 'This invoice cannot be paid online.' }, { status: 400 });
    }

    const totalAmount = Number(invoice.amount);
    const paidAmount = Number(invoice.paidAmount ?? 0);
    const remainingBalance = Math.max(0, totalAmount - paidAmount);
    if (remainingBalance <= 0) {
      return NextResponse.json({ success: false, message: 'This invoice is already paid.' }, { status: 400 });
    }

    const { url } = await createWiPayPaymentUrl(
      {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        clientId: client.id,
        amount: remainingBalance,
        currency: invoice.currency || 'TTD',
        customerEmail: client.email,
        customerName: client.name || client.companyName,
        customerPhone: client.phone,
      },
      getRequestPublicOrigin(req)
    );

    return NextResponse.json({ success: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start payment';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
