import { NextRequest, NextResponse } from 'next/server';
import { AuthError, authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { savePartsCatalogMediaUpload } from '@/lib/parts-catalog-media';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;

/** Upload a product image or working-condition video for a parts listing. */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    const form = await req.formData();
    const kindRaw = String(form.get('kind') ?? 'image');
    const kind = kindRaw === 'video' ? 'video' : 'image';
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: 'File required' }, { status: 400 });
    }

    if (kind === 'image') {
      if (!file.type.startsWith('image/')) {
        return NextResponse.json({ success: false, message: 'Only image uploads are allowed' }, { status: 400 });
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ success: false, message: 'Image must be 12MB or smaller' }, { status: 400 });
      }
    } else {
      if (!file.type.startsWith('video/')) {
        return NextResponse.json({ success: false, message: 'Only video uploads are allowed' }, { status: 400 });
      }
      if (file.size > MAX_VIDEO_BYTES) {
        return NextResponse.json({ success: false, message: 'Video must be 80MB or smaller' }, { status: 400 });
      }
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = savePartsCatalogMediaUpload({
      buffer,
      fileName: file.name,
      mimeType: file.type,
      kind,
    });

    return NextResponse.json({
      success: true,
      fileName: saved.fileName,
      kind,
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
