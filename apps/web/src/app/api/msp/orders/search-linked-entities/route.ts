import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { searchLinkableEntities } from '@/lib/orders';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { searchParams } = req.nextUrl;
    const query = searchParams.get('query') ?? '';
    const type = searchParams.get('type') as 'ticket' | 'invoice' | undefined;
    const clientId = searchParams.get('clientId') ?? undefined;

    if (query.trim().length < 2) {
      return NextResponse.json({ success: false, message: 'Search query must be at least 2 characters' }, { status: 400 });
    }

    const results = await searchLinkableEntities({ query, type, clientId });
    return NextResponse.json({ success: true, results });
  } catch (error) {
    return authErrorResponse(error);
  }
}
