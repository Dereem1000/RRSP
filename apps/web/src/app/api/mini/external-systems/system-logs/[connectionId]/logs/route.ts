import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    requireSession(req);
    if (!(await isMiniDockActive())) {
      return NextResponse.json({ success: false, error: 'Mini is not connected' }, { status: 503 });
    }

    const { connectionId } = await params;
    const id = String(connectionId || '').trim();
    if (!id) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    const limit = req.nextUrl.searchParams.get('limit') || '200';
    const result = await miniProxyRequest(
      `/api/external-systems/system-logs/connections/${encodeURIComponent(id)}/logs?limit=${encodeURIComponent(limit)}`,
      { method: 'GET' }
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
