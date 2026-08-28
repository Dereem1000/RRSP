import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isIpBlockedSync } from '@/lib/blocked-ips-mirror';
import { isSafeReturnPath, resolveReturnPath } from '@/lib/safe-return-url';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health', '/api/public'];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return true;
  if (pathname.endsWith('.html')) return true;
  if (pathname.startsWith('/images/')) return true;
  if (pathname.startsWith('/js/')) return true;
  if (pathname === '/demos-manifest.json' || pathname === '/demo-pages.json') return true;
  if (pathname === '/demo' || pathname.startsWith('/demo/')) return true;
  if (pathname === '/logo.png' || pathname === '/logo.svg') return true;
  return false;
}

function clientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    const ip = clientIp(request);
    if (isIpBlockedSync(ip)) {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    return NextResponse.next();
  }

  const token = request.cookies.get('cd_access_token')?.value;

  if (pathname === '/' || isPublicPath(pathname)) {
    if (pathname === '/login' && token) {
      const returnUrl = request.nextUrl.searchParams.get('returnUrl');
      const dest = resolveReturnPath(returnUrl);
      return NextResponse.redirect(new URL(dest, request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    const returnPath = `${pathname}${request.nextUrl.search}`;
    const loginUrl = new URL('/login', request.url);
    if (isSafeReturnPath(returnPath)) {
      loginUrl.searchParams.set('returnUrl', returnPath);
    }
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();
  response.headers.set('x-cd-return-path', `${pathname}${request.nextUrl.search}`);
  return response;
}

export const config = {
  matcher: ['/((?!_next/|favicon.ico|logo\\.png|logo\\.svg|images/|js/).*)'],
  // Node.js runtime: blocked-ips mirror reads data/security_blocked_ips.json via fs.
  runtime: 'nodejs',
};
