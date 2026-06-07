import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getEmailMonitoringStatus, saveEmailMonitoringConfig } from '@/lib/order-email-monitoring';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const status = await getEmailMonitoringStatus();
    return NextResponse.json({ success: true, config: status });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const body = await req.json();
    await saveEmailMonitoringConfig(body);
    const config = await getEmailMonitoringStatus();
    return NextResponse.json({ success: true, message: 'Email monitoring settings saved', config });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save settings';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
