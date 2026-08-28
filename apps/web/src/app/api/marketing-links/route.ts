import { NextRequest, NextResponse } from 'next/server';
import { AuthError, authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  readMarketingLinkOverrides,
  saveMarketingLinkOverride,
} from '@/lib/marketing-links';

export const runtime = 'nodejs';

/** Public map of marketing link overrides (slot → URL). */
export async function GET() {
  return NextResponse.json({
    success: true,
    overrides: readMarketingLinkOverrides(),
  });
}

/** Admin-only update for a marketing page link. */
export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json().catch(() => null);
    const slot = String(body?.slot ?? '');
    const url = String(body?.url ?? '');
    if (!slot || !url) {
      return NextResponse.json({ success: false, message: 'slot and url required' }, { status: 400 });
    }

    const saved = saveMarketingLinkOverride({ slot, url });

    return NextResponse.json({
      success: true,
      slot: saved.slot,
      url: saved.url,
      overrides: readMarketingLinkOverrides(),
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    const message = error instanceof Error ? error.message : 'Update failed';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
