import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getMspDashboardData } from '@/lib/msp-dashboard';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');
    const data = await getMspDashboardData();
    return NextResponse.json({ success: true, dashboard: data });
  } catch (error) {
    return authErrorResponse(error);
  }
}
