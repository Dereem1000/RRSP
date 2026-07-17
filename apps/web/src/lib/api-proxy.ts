import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = (process.env.CD_API_ORIGIN || 'http://127.0.0.1:4000').replace(/\/$/, '');
/** Slightly above Next `maxDuration` so long Mini kit pushes can finish. */
const PROXY_TIMEOUT_MS = 905_000;
const PROXY_RETRY_ATTEMPTS = 5;
const PROXY_RETRY_BASE_MS = 400;

function isTransientProxyError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TimeoutError') return false;
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNREFUSED|ECONNRESET|EADDRNOTAVAIL|socket hang up|network/i.test(message);
}

async function fetchExpressApi(target: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PROXY_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetch(target, init);
    } catch (error) {
      lastError = error;
      if (!isTransientProxyError(error) || attempt === PROXY_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, PROXY_RETRY_BASE_MS * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function proxyToExpressApi(req: NextRequest, pathSegments: string[]): Promise<NextResponse> {
  const pathname = pathSegments.map(encodeURIComponent).join('/');
  const target = `${API_ORIGIN}/api/${pathname}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'host' || lower === 'connection') return;
    headers.set(key, value);
  });

  const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
  };

  if (hasBody) {
    // Buffer the body — passing req.body directly can throw
    // "Response body object should not be disturbed or locked" on Next.js 15.
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetchExpressApi(target, init);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'API unavailable';
    const timedOut =
      (error instanceof Error && error.name === 'TimeoutError') ||
      /aborted|timeout/i.test(message);
    return NextResponse.json(
      {
        success: false,
        error: timedOut
          ? 'The portal API request timed out. Long Mini operations may still be running — wait a minute and refresh.'
          : `Express API unreachable (${API_ORIGIN}): ${message}`,
      },
      { status: timedOut ? 504 : 503 }
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie') return;
    responseHeaders.set(key, value);
  });
  const setCookies = upstream.headers.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    for (const cookie of setCookies) {
      responseHeaders.append('set-cookie', cookie);
    }
  } else {
    const rawSetCookie = upstream.headers.get('set-cookie');
    if (rawSetCookie) responseHeaders.append('set-cookie', rawSetCookie);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
