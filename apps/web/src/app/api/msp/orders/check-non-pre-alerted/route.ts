import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { checkNonPreAlertedOrders } from '@/lib/orders';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json().catch(() => ({}));
    const count = await checkNonPreAlertedOrders(Number(body.hoursThreshold ?? 24));

    return NextResponse.json({
      success: true,
      message: `Created ${count} notice(s) for non-pre-alerted orders`,
      noticesCreated: count,
      hoursThreshold: Number(body.hoursThreshold ?? 24),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check pre-alerts';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
