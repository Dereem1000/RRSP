import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { activateEmergencyOverride } from '@cd-v2/security';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    if (!body.reason?.toString().trim()) {
      return NextResponse.json({ success: false, message: 'Reason is required' }, { status: 400 });
    }
    if (!body.authorization?.toString().trim()) {
      return NextResponse.json(
        { success: false, message: 'Authorization code is required' },
        { status: 400 }
      );
    }

    const result = await activateEmergencyOverride({
      userId: session.id,
      reason: String(body.reason),
      authorization: String(body.authorization),
      userClearance: session.clearance ?? 'S-CLS3',
      durationMinutes: body.duration ? Number(body.duration) : 60,
      ipAddress: req.headers.get('x-forwarded-for') ?? undefined,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      success: true,
      message: 'Emergency override activated',
      details: {
        reason: body.reason,
        duration: `${result.duration} minutes`,
        expiresAt: result.expiresAt,
        overrideId: result.override.id,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to activate override';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
