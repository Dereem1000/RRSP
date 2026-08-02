import { NextResponse } from 'next/server';

/** Internal Flask license API — must be running on :5001 when using Cloudflare tunnel mode. */
export function getLicenseApiInternalBase(): string {
  const configured = process.env.LICENSE_API_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const port = process.env.LICENSE_API_PORT?.trim() || '5001';
  return `http://127.0.0.1:${port}`;
}

const LICENSE_PROXY_TIMEOUT_MS = 12_000;
const LICENSE_PROXY_RETRIES = 4;
const LICENSE_PROXY_RETRY_BASE_MS = 300;

function isTransientLicenseProxyError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TimeoutError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNREFUSED|ECONNRESET|EADDRNOTAVAIL|socket hang up|network|aborted|timeout/i.test(
    message
  );
}

export async function proxyToLicenseApi(path: string, init?: RequestInit): Promise<Response> {
  const url = `${getLicenseApiInternalBase()}${path}`;
  let lastError: unknown;
  for (let attempt = 0; attempt < LICENSE_PROXY_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        cache: 'no-store',
        signal: init?.signal ?? AbortSignal.timeout(LICENSE_PROXY_TIMEOUT_MS),
      });
      const body = await res.text();
      return new Response(body, {
        status: res.status,
        headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
      });
    } catch (err) {
      lastError = err;
      if (!isTransientLicenseProxyError(err) || attempt === LICENSE_PROXY_RETRIES - 1) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, LICENSE_PROXY_RETRY_BASE_MS * (attempt + 1))
      );
    }
  }

  const message = lastError instanceof Error ? lastError.message : 'License API unreachable';
  return NextResponse.json(
    {
      success: false,
      valid: false,
      error: 'License API unavailable',
      message: `${message}. Ensure the license API is running (port ${process.env.LICENSE_API_PORT ?? '5001'}).`,
    },
    { status: 503 }
  );
}
