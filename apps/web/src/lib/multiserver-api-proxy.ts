import { NextRequest, NextResponse } from 'next/server';

/** MultiServer control API — must be running on :5674 when using Cloudflare tunnel mode. */
export function getMultiServerInternalBase(): string {
  const configured = process.env.MULTISERVER_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const port = process.env.MULTISERVER_MANAGER_PORT?.trim() || '5674';
  return `http://127.0.0.1:${port}`;
}

const MULTISERVER_PROXY_TIMEOUT_MS = 900_000;

export async function proxyToMultiServer(
  req: NextRequest,
  path: string
): Promise<Response> {
  const base = getMultiServerInternalBase();
  const normalized = path.startsWith('/') ? path : `/${path}`;
  const url = `${base}${normalized}`;

  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const contentType = req.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const accept = req.headers.get('accept');
  if (accept) headers.set('accept', accept);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(MULTISERVER_PROXY_TIMEOUT_MS),
  };
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  try {
    const res = await fetch(url, init);
    const body = await res.arrayBuffer();
    const responseHeaders = new Headers();
    const resType = res.headers.get('content-type');
    if (resType) responseHeaders.set('content-type', resType);
    return new Response(body, { status: res.status, headers: responseHeaders });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'MultiServer unreachable';
    return NextResponse.json(
      {
        error: 'MultiServer unavailable',
        message: `${message}. Ensure MultiServer is running (port ${process.env.MULTISERVER_MANAGER_PORT ?? '5674'}).`,
      },
      { status: 503 }
    );
  }
}
