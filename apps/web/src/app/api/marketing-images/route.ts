import { NextRequest, NextResponse } from 'next/server';
import { AuthError, authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  readMarketingImageDisplay,
  readMarketingImageOverrides,
  saveMarketingImageDisplay,
  saveMarketingImageUpload,
  type MarketingImageDisplay,
} from '@/lib/marketing-images';

export const runtime = 'nodejs';
export const maxDuration = 120;

/** Public map of marketing image overrides (slot → public URL). */
export async function GET() {
  return NextResponse.json({
    success: true,
    overrides: readMarketingImageOverrides(),
    display: readMarketingImageDisplay(),
  });
}

/** Admin-only upload to replace a marketing page image. */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const form = await req.formData();
    const slot = String(form.get('slot') ?? '');
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: 'Image file required' }, { status: 400 });
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ success: false, message: 'Only image uploads are allowed' }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: 'Image must be 12MB or smaller' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = saveMarketingImageUpload({
      slot,
      buffer,
      fileName: file.name,
      mimeType: file.type,
    });

    return NextResponse.json({
      success: true,
      slot: saved.slot,
      url: saved.url,
      overrides: readMarketingImageOverrides(),
      display: readMarketingImageDisplay(),
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Upload failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

/** Admin-only display tuning (crop position, size, fit) for a marketing image slot. */
export async function PATCH(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = (await req.json()) as { slot?: string; display?: MarketingImageDisplay | null };
    const slot = String(body.slot ?? '');
    const saved = saveMarketingImageDisplay({
      slot,
      display: body.display ?? null,
    });

    return NextResponse.json({
      success: true,
      slot: saved.slot,
      display: saved.display,
      displayMap: readMarketingImageDisplay(),
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Save failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
