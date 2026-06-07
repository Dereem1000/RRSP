import { NextRequest, NextResponse } from 'next/server';
import { blockIp, loadBlockedIps, unblockIp } from '@cd-v2/security';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const blocked = await loadBlockedIps();
    return NextResponse.json({ success: true, blocked });
  } catch (e) {
    return authErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    if (session.clearance !== 'S-CLS1') {
      return NextResponse.json({ success: false, message: 'S-CLS1 required' }, { status: 403 });
    }
    const body = await req.json();
    if (body.action === 'unblock' && body.ip) {
      await unblockIp(String(body.ip));
      return NextResponse.json({ success: true, message: 'Unblocked' });
    }
    if (body.action === 'block' && body.ip) {
      await blockIp(String(body.ip), String(body.reason ?? 'Manual block'));
      return NextResponse.json({ success: true, message: 'Blocked' });
    }
    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (e) {
    return authErrorResponse(e);
  }
}
