import { NextRequest, NextResponse } from 'next/server';
import { getSecurityBadgeSummary } from '@cd-v2/security';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const summary = await getSecurityBadgeSummary();
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    return authErrorResponse(error);
  }
}
