import { NextRequest, NextResponse } from 'next/server';
import { AuthError, authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { posCatalogMediaPublicUrl, savePosCatalogMediaUpload } from '@/lib/pos-catalog-media';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 5 * 1024 * 1024;

/** Download a picked search result into CD pos-catalog-media (canonical source of truth). */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = (await req.json()) as { url?: string };
    const sourceUrl = String(body.url || '').trim();
    if (!sourceUrl || !/^https?:\/\//i.test(sourceUrl)) {
      return NextResponse.json({ success: false, message: 'A valid image URL is required' }, { status: 400 });
    }

    const response = await fetch(sourceUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(25_000),
      headers: { Accept: 'image/*' },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `Could not download image (${response.status})` },
        { status: 400 },
      );
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() || '';
    if (!contentType.startsWith('image/')) {
      return NextResponse.json({ success: false, message: 'URL did not return an image' }, { status: 400 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json({ success: false, message: 'Image must be 5MB or smaller' }, { status: 400 });
    }

    const extFromType =
      contentType === 'image/png'
        ? '.png'
        : contentType === 'image/webp'
          ? '.webp'
          : contentType === 'image/gif'
            ? '.gif'
            : '.jpg';

    const saved = savePosCatalogMediaUpload({
      buffer,
      fileName: `import${extFromType}`,
      mimeType: contentType,
    });

    const url = posCatalogMediaPublicUrl(saved.fileName);
    return NextResponse.json({ success: true, fileName: saved.fileName, url });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Import failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
