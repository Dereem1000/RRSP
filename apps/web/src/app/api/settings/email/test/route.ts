import { NextRequest, NextResponse } from 'next/server';
import { User } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { sendAllTemplateTestEmails } from '@/lib/email-test';
import { testEmailConnection } from '@/lib/email';

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    const admin = await User.findByPk(session.id, { attributes: ['email'] });
    const to = body.to || admin?.email;
    if (!to) {
      return NextResponse.json({ success: false, message: 'No recipient email provided' }, { status: 400 });
    }

    const connection = await testEmailConnection();
    if (!connection.success) {
      return NextResponse.json({ success: false, message: connection.message }, { status: 400 });
    }

    const result = await sendAllTemplateTestEmails(to, req.nextUrl.origin);

    return NextResponse.json({
      success: result.failed === 0,
      message:
        result.failed === 0
          ? `Sent ${result.emailCount} bundled test emails (${result.templateCount} template previews) to ${to}`
          : `Sent ${result.sent} of ${result.total} bundled emails (${result.templateCount} previews). Failed: ${result.errors.join(', ')}`,
      ...result,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
