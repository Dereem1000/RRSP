import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { resetUserPassword } from '@/lib/users';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin');

    const { id } = await params;
    const result = await resetUserPassword(Number(id));
    if (!result) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset. Share the temporary password with the user.',
      user: result.user,
      tempPassword: result.tempPassword,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to reset password';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
