import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';

export async function POST(req: NextRequest) {
  try {
    requireSession(req);
    if (!(await isMiniDockActive())) {
      return NextResponse.json({ success: false, error: 'Mini is not connected' }, { status: 503 });
    }
    const body = await req.json();
    const result = await miniProxyRequest('/api/external-systems/system-logs/forget', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
