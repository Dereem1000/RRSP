import { NextRequest, NextResponse } from 'next/server';
import { User, publicUser } from '@/lib/db';
import { authErrorResponse, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    const user = await User.findByPk(session.id, {
      attributes: { exclude: ['password', 'tempPassword'] },
    });
    if (!user) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, user: publicUser(user) });
  } catch (error) {
    return authErrorResponse(error);
  }
}
