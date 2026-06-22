import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';

export async function GET(req: NextRequest) {
  try {
    requireSession(req);
    if (!(await isMiniDockActive())) {
      return NextResponse.json({ success: false, error: 'Mini is not connected' }, { status: 503 });
    }
    const result = await miniProxyRequest('/api/dashboard', { method: 'GET' });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    return authErrorResponse(error);
  }
}
