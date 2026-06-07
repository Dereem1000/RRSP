import { NextRequest, NextResponse } from 'next/server';
import { getInvoiceById } from '@/lib/accounting';
import { buildInvoicePrintHtml } from '@/lib/document-html';
import { verifyViewToken } from '@/lib/view-tokens';

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const payload = verifyViewToken(decodeURIComponent(token));
    if (!payload || payload.purpose !== 'invoice_view') {
      return new NextResponse('This link is invalid or has expired.', { status: 401 });
    }

    const invoice = await getInvoiceById(payload.invoiceId);
    if (!invoice) {
      return new NextResponse('Invoice not found.', { status: 404 });
    }

    const html = await buildInvoicePrintHtml(invoice);
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[PUBLIC INVOICE PRINT]', error);
    return new NextResponse('Failed to generate invoice document.', { status: 500 });
  }
}
