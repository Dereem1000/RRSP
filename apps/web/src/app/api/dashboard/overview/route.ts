import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getDashboardOverview } from '@/lib/dashboard';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    const dashboard = await getDashboardOverview(session.role, session.id);
    return NextResponse.json({ success: true, dashboard });
  } catch (error) {
    return authErrorResponse(error);
  }
}
