import type { NextRequest } from 'next/server';
import { proxyToExpressApi } from '@/lib/api-proxy';

type RouteContext = { params: Promise<{ path?: string[] }> };

export function createApiProxyRouteHandlers(prefix: string[]) {
  async function handle(req: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    const segments = [...prefix, ...(path ?? [])];
    return proxyToExpressApi(req, segments);
  }

  return {
    GET: handle,
    POST: handle,
    PUT: handle,
    PATCH: handle,
    DELETE: handle,
  };
}
