import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { refreshEmergencyState } from '@cd-v2/security';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const status = await refreshEmergencyState();
    return NextResponse.json({
      success: true,
      emergencyOverride: status,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
