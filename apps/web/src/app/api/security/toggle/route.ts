import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { setMonitoringEnabled } from '@cd-v2/security';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    if (typeof body.enable !== 'boolean') {
      return NextResponse.json({ success: false, message: 'enable (boolean) is required' }, { status: 400 });
    }

    const platform = await setMonitoringEnabled({
      enable: body.enable,
      userId: session.id,
      userClearance: session.clearance ?? 'S-CLS3',
      authorization: body.authorization_key ?? body.authorization,
    });

    return NextResponse.json({
      success: true,
      message: body.enable ? 'Security monitoring enabled' : 'Security monitoring disabled',
      platform,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update AI Security';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
