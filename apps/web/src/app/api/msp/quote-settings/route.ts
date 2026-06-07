import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getQuoteSettings, updateQuoteSettings } from '@/lib/quote-settings';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');
    const settings = await getQuoteSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const body = await req.json();
    await updateQuoteSettings(body);
    const settings = await getQuoteSettings();
    return NextResponse.json({ success: true, message: 'Quote settings updated', settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update quote settings';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
