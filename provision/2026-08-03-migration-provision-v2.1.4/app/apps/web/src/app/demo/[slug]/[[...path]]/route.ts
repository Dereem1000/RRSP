import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import {
  LEGACY_SLUG_REDIRECTS,
  demoUiPrefix,
  findDemo,
  getDemoManifest,
} from '@/lib/multiserver/manifest';
import { proxyDemoRequest } from '@/lib/multiserver/proxy';

type RouteContext = { params: Promise<{ slug: string; path?: string[] }> };

async function handle(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;

  const legacy = LEGACY_SLUG_REDIRECTS[slug];
  if (legacy) {
    const rest = request.nextUrl.pathname.replace(`/demo/${slug}`, '') || '/';
    const url = new URL(`/demo/${legacy}${rest === '/' ? '/' : rest}`, request.url);
    url.search = request.nextUrl.search;
    return NextResponse.redirect(url, 301);
  }

  const manifest = await getDemoManifest();
  if (!manifest?.demos?.length) {
    return new NextResponse('Demo manifest not found. Run Sync website in MultiServer.', {
      status: 503,
    });
  }

  const demo = findDemo(manifest, slug);
  if (!demo) {
    return new NextResponse(`Demo "${slug}" is not configured in MultiServer.`, { status: 404 });
  }

  const uiPrefix = demoUiPrefix(manifest, demo.slug);
  const pathname = request.nextUrl.pathname;
  // Relative ./ assets need a trailing slash on the demo root URL.
  if (pathname === uiPrefix) {
    const url = request.nextUrl.clone();
    url.pathname = `${uiPrefix}/`;
    return NextResponse.redirect(url, 308);
  }

  return proxyDemoRequest(request, manifest, demo, demo.slug);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const HEAD = handle;
export const OPTIONS = handle;

export const runtime = 'nodejs';
