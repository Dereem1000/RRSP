import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getPlatformSecurityStatus } from '@cd-v2/security';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const platform = await getPlatformSecurityStatus();
    return NextResponse.json({
      success: true,
      aiSecurity: {
        enabled: platform.monitoring.enabled,
        status: platform.monitoring.enabled ? 'active' : 'disabled',
        threatLevel: platform.monitoring.threatLevel,
        totalEvents24h: platform.monitoring.eventsLast24h,
        recentEvents: platform.recentEvents,
        emergencyOverrideActive: platform.emergency.isActive,
        lastUpdated: platform.lastUpdated,
      },
      platform,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
