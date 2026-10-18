import { NextRequest, NextResponse } from 'next/server';
import { AuthError, authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { posCatalogMediaPublicUrl, savePosCatalogMediaUpload } from '@/lib/pos-catalog-media';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Admin upload for federation / canonical catalog product images. */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: 'File required' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, message: 'Only image uploads are allowed' }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ success: false, message: 'Image must be 12MB or smaller' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = savePosCatalogMediaUpload({
      buffer,
      fileName: file.name,
      mimeType: file.type,
    });

    return NextResponse.json({
      success: true,
      fileName: saved.fileName,
      url: posCatalogMediaPublicUrl(saved.fileName),
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
