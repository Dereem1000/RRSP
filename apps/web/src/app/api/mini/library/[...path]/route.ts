import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxyLibrary(req: NextRequest, context: RouteContext, method: 'GET' | 'POST') {
  requireSession(req);
  if (!(await isMiniDockActive())) {
    return NextResponse.json({ error: 'Mini is not connected' }, { status: 503 });
  }

  const { path } = await context.params;
  const segments = path || [];
  const target = `/api/library/${segments.join('/')}`;
  const init: RequestInit = { method };

  if (method === 'POST') {
    const body = await req.json().catch(() => ({}));
    init.body = JSON.stringify(body);
  }

  const result = await miniProxyRequest(target, init);
  return NextResponse.json(result.body, { status: result.status });
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    return await proxyLibrary(req, context, 'GET');
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    return await proxyLibrary(req, context, 'POST');
  } catch (error) {
    return authErrorResponse(error);
  }
}
