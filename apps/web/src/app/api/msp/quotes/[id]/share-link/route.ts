import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getQuoteById } from '@/lib/accounting';
import { buildPublicDocumentUrl, signQuoteViewToken } from '@/lib/view-tokens';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const quote = await getQuoteById(id);
    if (!quote) {
      return NextResponse.json({ success: false, message: 'Quote not found' }, { status: 404 });
    }

    const token = signQuoteViewToken(id);
    const encoded = encodeURIComponent(token);
    const origin = req.headers.get('origin') ?? undefined;

    return NextResponse.json({
      success: true,
      token,
      viewUrl: buildPublicDocumentUrl(`/api/public/quote/${encoded}/print`, origin),
      apiUrl: buildPublicDocumentUrl(`/api/public/quote/${encoded}`, origin),
      expiresIn: process.env.INVOICE_VIEW_TOKEN_EXPIRES || '60d',
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
