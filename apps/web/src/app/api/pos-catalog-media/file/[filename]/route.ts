import { NextRequest, NextResponse } from 'next/server';
import { loadPosCatalogMediaBytes } from '@/lib/pos-catalog-media';

export const runtime = 'nodejs';

/** Serve POS starter / federation catalog product images (local data dir or federated POS proxy). */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ filename: string }> }
) {
  const { filename } = await context.params;
  const loaded = await loadPosCatalogMediaBytes(filename);
  if (!loaded) {
    return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(loaded.buffer), {
    status: 200,
    headers: {
      'Content-Type': loaded.mime,
      'Cache-Control':
        loaded.source === 'remote' ? 'public, max-age=3600' : 'public, max-age=86400',
    },
  });
}
