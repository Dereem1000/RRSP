import { NextResponse } from 'next/server';

/** Internal Flask license API — must be running on :5001 when using Cloudflare tunnel mode. */
export function getLicenseApiInternalBase(): string {
  const configured = process.env.LICENSE_API_INTERNAL_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const port = process.env.LICENSE_API_PORT?.trim() || '5001';
  return `http://127.0.0.1:${port}`;
}

export async function proxyToLicenseApi(path: string, init?: RequestInit): Promise<Response> {
  const url = `${getLicenseApiInternalBase()}${path}`;
  try {
    const res = await fetch(url, { ...init, cache: 'no-store' });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'License API unreachable';
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
}
