import { NextRequest, NextResponse } from 'next/server';
import { getDashboardOverview } from '@/lib/dashboard';
import { authErrorResponse, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    const dashboard = await getDashboardOverview(session.role, session.id);
    return NextResponse.json({ success: true, stats: dashboard.stats });
  } catch (error) {
    return authErrorResponse(error);
  }
}
