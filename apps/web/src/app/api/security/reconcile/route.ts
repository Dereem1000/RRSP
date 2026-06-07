import { NextRequest, NextResponse } from 'next/server';
import { getPlatformSecurityStatus, reconcileSecurityEvents } from '@cd-v2/security';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const result = await reconcileSecurityEvents();
    const platform = await getPlatformSecurityStatus();

    const message =
      result.cleared > 0
        ? `Cleared ${result.cleared} resolved event(s). Threat level: ${result.previousThreatLevel} → ${result.threatLevel}.`
        : result.remaining === 0
          ? `All clear. Threat level: ${result.threatLevel}.`
          : `No resolved events to clear. ${result.remaining} active event(s); threat level: ${result.threatLevel}.`;

    return NextResponse.json({
      success: true,
      message,
      result,
      platform,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
