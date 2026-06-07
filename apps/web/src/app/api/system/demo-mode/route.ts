import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getGeneralSettings } from '@/lib/settings';
import { isDemoSandboxActive } from '@cd-v2/database';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role === 'client') {
      return NextResponse.json({ success: true, demoMode: false });
    }

    const { demoMode } = await getGeneralSettings();
    return NextResponse.json({ success: true, demoMode: isDemoSandboxActive() || demoMode });
  } catch (error) {
    return authErrorResponse(error);
  }
}
