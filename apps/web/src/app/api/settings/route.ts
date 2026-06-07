import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  getEmailSettings,
  getGeneralSettings,
  getTicketNotificationSettings,
  saveEmailSettings,
  saveGeneralSettings,
  saveTicketNotificationSettings,
} from '@/lib/settings';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const [email, tickets, general] = await Promise.all([
      getEmailSettings(),
      getTicketNotificationSettings(),
      getGeneralSettings(),
    ]);

    return NextResponse.json({
      success: true,
      email: { ...email, password: email.password ? '********' : '' },
      tickets,
      general,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    if (body.email) await saveEmailSettings(body.email);
    if (body.tickets) await saveTicketNotificationSettings(body.tickets);
    if (body.general) await saveGeneralSettings(body.general);

    return NextResponse.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
