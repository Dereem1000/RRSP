import { NextRequest, NextResponse } from 'next/server';
import { isMasterAuthCodeConfigured, setEmergencyAuthCodeHash } from '@cd-v2/security';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    return NextResponse.json({
      success: true,
      configured: await isMasterAuthCodeConfigured(),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    if (session.clearance !== 'S-CLS1') {
      return NextResponse.json(
        { success: false, message: 'Only S-CLS1 admins can set the master authorization code' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const code = body.code?.toString().trim();
    if (!code || code.length < 8) {
      return NextResponse.json(
        { success: false, message: 'Code must be at least 8 characters' },
        { status: 400 }
      );
    }

    await setEmergencyAuthCodeHash(code);

    return NextResponse.json({
      success: true,
      message: 'Master authorization code updated. It is stored as a bcrypt hash.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save code';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
