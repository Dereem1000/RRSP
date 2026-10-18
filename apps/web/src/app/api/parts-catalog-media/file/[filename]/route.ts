import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { resolvePartsCatalogMediaFile } from '@/lib/parts-catalog-media';

export const runtime = 'nodejs';

/** Serve parts listing images and verification videos. */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const kindParam = req.nextUrl.searchParams.get('kind');
  const kind = kindParam === 'video' ? 'video' : 'image';
  const resolved = resolvePartsCatalogMediaFile(filename, kind);
  if (!resolved) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  const body = new Uint8Array(fs.readFileSync(resolved.abs));
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': resolved.mime,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
