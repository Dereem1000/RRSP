import { NextRequest, NextResponse } from 'next/server';
import { getQuoteById } from '@/lib/accounting';
import { buildQuotePrintHtml } from '@/lib/document-html';
import { verifyViewToken } from '@/lib/view-tokens';

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const payload = verifyViewToken(decodeURIComponent(token));
    if (!payload || payload.purpose !== 'quote_view') {
      return new NextResponse('This link is invalid or has expired.', { status: 401 });
    }

    const quote = await getQuoteById(payload.quoteId);
    if (!quote) {
      return new NextResponse('Quote not found.', { status: 404 });
    }

    const html = await buildQuotePrintHtml(quote);
    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('[PUBLIC QUOTE PRINT]', error);
    return new NextResponse('Failed to generate quote document.', { status: 500 });
  }
}
