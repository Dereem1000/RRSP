import type { NextRequest } from 'next/server';
import { proxyToMultiServer } from '@/lib/multiserver-api-proxy';

export const maxDuration = 900;

type RouteContext = { params: Promise<{ path?: string[] }> };

async function handle(req: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const suffix = (path ?? []).join('/');
  const target = `/api/integrations/mini${suffix ? `/${suffix}` : ''}`;
  return proxyToMultiServer(req, target);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
