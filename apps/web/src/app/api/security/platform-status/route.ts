import { NextRequest, NextResponse } from 'next/server';
import { getPlatformSecurityStatus } from '@cd-v2/security';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const platform = await getPlatformSecurityStatus();
    return NextResponse.json({ success: true, platform });
  } catch (error) {
    return authErrorResponse(error);
  }
}
