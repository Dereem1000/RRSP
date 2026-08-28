import type { NextRequest } from 'next/server';
import { proxyToExpressApi } from '@/lib/api-proxy';

type RouteContext = { params: Promise<{ path?: string[] }> };

/** Abort-safe API proxy handlers — lives outside the integrity-protected create-api-proxy-route.ts shim. */
export function createApiProxyRouteHandlers(prefix: string[]) {
  async function handleProxy(req: NextRequest, context: RouteContext) {
    if (req.signal.aborted) {
      return new Response(null, { status: 499 });
    }
    try {
      const { path } = await context.params;
      const segments = [...prefix, ...(path ?? [])];
      return await proxyToExpressApi(req, segments);
    } catch (error) {
      if (req.signal.aborted) {
        return new Response(null, { status: 499 });
      }
      throw error;
    }
  }

  return {
    GET: handleProxy,
    POST: handleProxy,
    PUT: handleProxy,
    PATCH: handleProxy,
    DELETE: handleProxy,
  };
}
