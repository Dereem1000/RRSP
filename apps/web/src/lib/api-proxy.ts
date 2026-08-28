import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = (process.env.CD_API_ORIGIN || 'http://127.0.0.1:4000').replace(/\/$/, '');
/** Slightly above Next `maxDuration` so long Mini kit pushes can finish. */
const PROXY_TIMEOUT_MS = 905_000;
/** Ride out Express cold-start / brief restarts (tsx load can take 30–90s). */
const PROXY_RETRY_ATTEMPTS = 20;
const PROXY_RETRY_BASE_MS = 500;

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  'expect',
]);

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) {
    return `${error.message}: ${cause.message}`;
  }
  if (cause && typeof cause === 'object' && 'code' in cause) {
    return `${error.message}: ${String((cause as { code?: string }).code)}`;
  }
  return error.message;
}

function isTransientProxyError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TimeoutError') return false;
  const message = errorMessage(error);
  return /fetch failed|ECONNREFUSED|ECONNRESET|EADDRNOTAVAIL|socket hang up|network|UND_ERR_/i.test(
    message
  );
}

function isClientAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'ECONNRESET' || code === 'ABORT_ERR') return true;
  const message = errorMessage(error).toLowerCase();
  return error.name === 'AbortError' || message.includes('aborted') || message.includes('econnreset');
}

async function isApiStartingResponse(response: Response): Promise<boolean> {
  if (response.status !== 503) return false;
  try {
    const body = (await response.clone().json()) as { starting?: boolean; status?: string };
    return body?.starting === true || body?.status === 'starting';
  } catch {
    return false;
  }
}

async function fetchExpressApi(target: string, baseInit: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PROXY_RETRY_ATTEMPTS; attempt++) {
    const init: RequestInit = {
      ...baseInit,
      cache: 'no-store',
      // Fresh timeout each attempt; do not reuse an aborted signal across retries.
      signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      headers: new Headers(baseInit.headers),
    };
    // Avoid stale keep-alive sockets after Express restarts.
    if (attempt > 0) {
      (init.headers as Headers).set('connection', 'close');
    }

    try {
      const response = await fetch(target, init);
      if (await isApiStartingResponse(response)) {
        if (attempt === PROXY_RETRY_ATTEMPTS - 1) return response;
        await new Promise((resolve) => setTimeout(resolve, PROXY_RETRY_BASE_MS * (attempt + 1)));
        continue;
      }
      return response;
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
  if (req.signal.aborted) {
    return new NextResponse(null, { status: 499 });
  }

  const pathname = pathSegments.map(encodeURIComponent).join('/');
  const target = `${API_ORIGIN}/api/${pathname}${req.nextUrl.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
  };

  if (hasBody) {
    // Buffer the body — passing req.body directly can throw
    // "Response body object should not be disturbed or locked" on Next.js 15.
    // Do not forward content-length/transfer-encoding; fetch recalculates from the buffer.
    init.body = await req.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetchExpressApi(target, init);
  } catch (error) {
    const message = errorMessage(error);
    const timedOut =
      (error instanceof Error && error.name === 'TimeoutError') ||
      /aborted|timeout/i.test(message);
    const detail = timedOut
      ? 'The portal API request timed out. Long Mini operations may still be running — wait a minute and refresh.'
      : `Express API unreachable (${API_ORIGIN}): ${message}`;
    return NextResponse.json(
      {
        success: false,
        error: detail,
        message: detail,
      },
      { status: timedOut ? 504 : 503 }
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || HOP_BY_HOP.has(lower)) return;
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

  // Buffer upstream bodies instead of streaming through Next.js. Piping upstream.body to the
  // browser can throw uncaught ECONNRESET when the client navigates away during long Mini ops.
  let bodyBytes: ArrayBuffer;
  try {
    bodyBytes = await upstream.arrayBuffer();
  } catch (error) {
    if (req.signal.aborted || isClientAbortError(error)) {
      return new NextResponse(null, { status: 499 });
    }
    const message = errorMessage(error);
    return NextResponse.json(
      {
        success: false,
        error: `Express API response interrupted (${API_ORIGIN}): ${message}`,
        message,
      },
      { status: 502 },
    );
  }

  if (req.signal.aborted) {
    return new NextResponse(null, { status: 499 });
  }

  return new NextResponse(bodyBytes, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
