import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { runEmailMonitoringCheck } from '@/lib/order-email-monitoring';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const result = await runEmailMonitoringCheck();
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email check failed';
    return NextResponse.json({ success: false, message, processed: 0, updated: 0 }, { status: 500 });
  }
}
