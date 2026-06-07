import { NextRequest, NextResponse } from 'next/server';
import { SecurityHttpKeys } from '@cd-v2/security';
import { SystemConfig } from '@cd-v2/database';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    if (session.clearance !== 'S-CLS1') {
      return NextResponse.json({ success: false, message: 'S-CLS1 required' }, { status: 403 });
    }
    const body = await req.json();
    const allowed = [
      SecurityHttpKeys.intrusionEnabled,
      SecurityHttpKeys.botEnabled,
      SecurityHttpKeys.botCaptchaEnabled,
      SecurityHttpKeys.repairEnabled,
      SecurityHttpKeys.repairUseBackups,
    ] as string[];
    if (!allowed.includes(body.key)) {
      return NextResponse.json({ success: false, message: 'Invalid key' }, { status: 400 });
    }
    await SystemConfig.setConfig(body.key, Boolean(body.value), 'boolean', 'security');
    return NextResponse.json({ success: true });
  } catch (e) {
    return authErrorResponse(e);
  }
}
