import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceById } from '@/lib/accounting';
import { getQuoteSettings } from '@/lib/quote-settings';
import { verifyViewToken } from '@/lib/view-tokens';

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const payload = verifyViewToken(decodeURIComponent(token));
    if (!payload || payload.purpose !== 'invoice_view') {
      return NextResponse.json(
        {
          success: false,
          message: 'This link is invalid or has expired. Please contact Computer Dynamics for a new invoice link.',
        },
        { status: 401 }
      );
    }

    const invoice = await getInvoiceById(payload.invoiceId);
    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }

    const settings = await getQuoteSettings();
    return NextResponse.json({
      success: true,
      invoice,
      branding: {
        companyName: settings.companyName,
        companyLogo: settings.companyLogo,
        companyAddress: settings.companyAddress,
        companyPhone: settings.companyPhone,
        companyWebsite: settings.companyWebsite,
      },
    });
  } catch (error) {
    console.error('[PUBLIC INVOICE]', error);
    return NextResponse.json({ success: false, message: 'Failed to load invoice' }, { status: 500 });
  }
}
