import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { resendWelcomeForClient } from '@/lib/clients';
import { buildPortalUrl, getRequestPublicOrigin } from '@/lib/site-url';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const client = await Client.findByPk(id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const result = await resendWelcomeForClient(client, await buildPortalUrl(getRequestPublicOrigin(req)));

    return NextResponse.json({
      success: true,
      message: result.emailSent
        ? result.created
          ? 'Portal account created and welcome email sent.'
          : 'Welcome email sent with new temporary password.'
        : result.created
          ? 'Portal account created. Email could not be sent — configure SMTP in system settings.'
          : 'Password reset. Email could not be sent — configure SMTP in system settings.',
      username: result.username,
      tempPassword: result.emailSent ? undefined : result.tempPassword,
      emailSent: result.emailSent,
      created: result.created,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
