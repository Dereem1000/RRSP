import { NextRequest, NextResponse } from 'next/server';
import { getThreatMetrics } from '@cd-v2/security';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const metrics = await getThreatMetrics();
    return NextResponse.json({ success: true, metrics });
  } catch (e) {
    return authErrorResponse(e);
  }
}
