import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';

export async function POST(req: NextRequest) {
  try {
    requireSession(req);
    if (!(await isMiniDockActive())) {
      return NextResponse.json({ success: false, error: 'Mini is not connected' }, { status: 503 });
    }

    let body: { fingerprints?: string[] } = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const result = await miniProxyRequest('/api/chat/notifications/ack', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
