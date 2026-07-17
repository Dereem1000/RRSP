// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { createUser, listUsers } from '@web/lib/users';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const searchParams = searchParamsFrom(ctx);
    const role = searchParams.get('role') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const active = (searchParams.get('active') as 'all' | 'active' | 'inactive') || 'all';

    const staffOnly = searchParams.get('staffOnly') !== '0';
    const users = await listUsers({ role, search, active, staffOnly });
    return { status: 200, body: { success: true, users } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const body = ctx.body as Record<string, unknown>;
    const required = ['username', 'email', 'firstName', 'lastName', 'role', 'securityClearance'] as const;
    for (const key of required) {
      if (!body[key]?.toString().trim()) {
        return { status: 400, body: { success: false, message: `${key} is required` } };
      }
    }

    if (!['admin', 'technician'].includes(body.role)) {
      return { status: 400, body: { success: false, message: 'Staff settings only supports admin and technician accounts' } };
    }
    if (!['S-CLS1', 'S-CLS2', 'S-CLS3'].includes(body.securityClearance)) {
      return { status: 400, body: { success: false, message: 'Invalid security clearance' } };
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

    return { status: 201, body: {
        success: true,
        message: result.tempPassword
          ? 'User created. Share the temporary password with them.'
          : 'User created',
        user: result.user,
        tempPassword: result.tempPassword,
      } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create user';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

