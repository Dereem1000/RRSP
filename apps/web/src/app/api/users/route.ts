import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { createUser, listUsers } from '@/lib/users';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { searchParams } = req.nextUrl;
    const role = searchParams.get('role') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const active = (searchParams.get('active') as 'all' | 'active' | 'inactive') || 'all';

    const users = await listUsers({ role, search, active });
    return NextResponse.json({ success: true, users });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    const required = ['username', 'email', 'firstName', 'lastName', 'role', 'securityClearance'] as const;
    for (const key of required) {
      if (!body[key]?.toString().trim()) {
        return NextResponse.json({ success: false, message: `${key} is required` }, { status: 400 });
      }
    }

    if (!['admin', 'technician', 'client'].includes(body.role)) {
      return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
    }
    if (!['S-CLS1', 'S-CLS2', 'S-CLS3'].includes(body.securityClearance)) {
      return NextResponse.json({ success: false, message: 'Invalid security clearance' }, { status: 400 });
    }

    const result = await createUser({
      username: String(body.username),
      email: String(body.email),
      firstName: String(body.firstName),
      lastName: String(body.lastName),
      role: body.role,
      securityClearance: body.securityClearance,
      password: body.password ? String(body.password) : undefined,
      phone: body.phone ?? null,
      bio: body.bio ?? null,
      isActive: body.isActive !== false,
    });

    return NextResponse.json(
      {
        success: true,
        message: result.tempPassword
          ? 'User created. Share the temporary password with them.'
          : 'User created',
        user: result.user,
        tempPassword: result.tempPassword,
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
