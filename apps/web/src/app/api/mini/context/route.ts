import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { isMiniDockActive } from '@/lib/mini-dock';
import { buildMiniCdContext } from '@/lib/mini-cd-context';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (!(await isMiniDockActive())) {
      return NextResponse.json({ error: 'Mini is not connected' }, { status: 503 });
    }

    const page = req.nextUrl.searchParams.get('page') || undefined;
    const pageLabel = req.nextUrl.searchParams.get('pageLabel') || undefined;
    const context = await buildMiniCdContext(session, { page, pageLabel });

    return NextResponse.json({ success: true, context });
  } catch (error) {
    return authErrorResponse(error);
  }
}
