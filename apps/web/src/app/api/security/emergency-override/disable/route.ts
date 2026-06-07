import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { disableAllEmergencyOverrides } from '@cd-v2/security';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json().catch(() => ({}));
    await disableAllEmergencyOverrides(session.id, body.reason);

    return NextResponse.json({
      success: true,
      message: 'Emergency override disabled',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
