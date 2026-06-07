import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getClientPortalInvoicePayments, getPortalClient } from '@/lib/client-portal-billing';
import { getWiPaySettings, isWiPayConfigured } from '@/lib/wipay-settings';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    if (session.role !== 'client') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client record not found' }, { status: 404 });
    }

    const { id } = await params;
    const result = await getClientPortalInvoicePayments(client.id, id);
    if (!result) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }

    const totalAmount = Number(result.invoice.amount);
    const paidAmount = Number(result.invoice.paidAmount ?? 0);
    const remainingBalance = Math.max(0, totalAmount - paidAmount);
    const wipaySettings = await getWiPaySettings();

    return NextResponse.json({
      success: true,
      invoice: result.invoice,
      payments: result.payments,
      totalPaid: paidAmount,
      remainingBalance,
      payAvailable:
        isWiPayConfigured(wipaySettings) &&
        remainingBalance > 0 &&
        result.invoice.status !== 'paid' &&
        result.invoice.status !== 'cancelled',
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
