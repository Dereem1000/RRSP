import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getInvoiceById } from '@/lib/accounting';
import { buildPublicDocumentUrl, signInvoiceViewToken } from '@/lib/view-tokens';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }

    const token = signInvoiceViewToken(id);
    const encoded = encodeURIComponent(token);
    const origin = req.headers.get('origin') ?? undefined;

    return NextResponse.json({
      success: true,
      token,
      viewUrl: buildPublicDocumentUrl(`/api/public/invoice/${encoded}/print`, origin),
      apiUrl: buildPublicDocumentUrl(`/api/public/invoice/${encoded}`, origin),
      expiresIn: process.env.INVOICE_VIEW_TOKEN_EXPIRES || '60d',
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
