import { NextRequest, NextResponse } from 'next/server';
import { getQuoteById } from '@/lib/accounting';
import { getQuoteSettings } from '@/lib/quote-settings';
import { verifyViewToken } from '@/lib/view-tokens';

type RouteParams = { params: Promise<{ token: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { token } = await params;
    const payload = verifyViewToken(decodeURIComponent(token));
    if (!payload || payload.purpose !== 'quote_view') {
      return NextResponse.json(
        { success: false, message: 'This link is invalid or has expired.' },
        { status: 401 }
      );
    }

    const quote = await getQuoteById(payload.quoteId);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }

    const settings = await getQuoteSettings();
    return NextResponse.json({
      success: true,
      quote,
      branding: {
        companyName: settings.companyName,
        companyLogo: settings.companyLogo,
        companyAddress: settings.companyAddress,
        companyPhone: settings.companyPhone,
        companyWebsite: settings.companyWebsite,
      },
    });
  } catch (error) {
    console.error('[PUBLIC QUOTE]', error);
    return NextResponse.json({ success: false, message: 'Failed to load quote' }, { status: 500 });
  }
}
