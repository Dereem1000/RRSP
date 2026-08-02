import { NextRequest, NextResponse } from 'next/server';
import { guardRequest } from '@cd-v2/security';

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function getRequestHost(req: NextRequest): string | null {
  return req.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || req.headers.get('host');
}

export async function applyRequestGuard(
  req: NextRequest,
  options?: { body?: string | null; honeypot?: string | null }
): Promise<NextResponse | null> {
  const url = new URL(req.url);
  const guard = await guardRequest({
    ip: getClientIp(req),
    path: url.pathname,
    method: req.method,
    userAgent: req.headers.get('user-agent'),
    acceptLanguage: req.headers.get('accept-language'),
    query: url.search.startsWith('?') ? url.search.slice(1) : url.search,
    body: options?.body ?? null,
    honeypot: options?.honeypot ?? null,
  });
  if (!guard.allow) {
    return NextResponse.json(
      { success: false, message: guard.reason ?? 'Forbidden' },
      { status: guard.logType === 'rate_limited' ? 429 : 403 }
    );
  }
  return null;
}
