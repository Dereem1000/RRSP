import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';
import { buildMiniCdContext, summarizeMiniCdContextForChat } from '@/lib/mini-cd-context';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (!(await isMiniDockActive())) {
      return NextResponse.json({ success: false, error: 'Mini is not connected' }, { status: 503 });
    }

    const body = await req.json();
    const message = String(body.message ?? '').trim();
    if (!message) {
      return NextResponse.json({ success: false, error: 'message is required' }, { status: 400 });
    }

    const page = String(body.page ?? '/dashboard').trim() || '/dashboard';
    const pageLabel = String(body.pageLabel ?? '').trim() || undefined;
    const cdContext = await buildMiniCdContext(session, { page, pageLabel });

    const result = await miniProxyRequest('/api/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        cd_context: {
          summary: summarizeMiniCdContextForChat(cdContext),
          snapshot: cdContext,
        },
      }),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
