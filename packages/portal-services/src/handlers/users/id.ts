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

import { deleteUser, getStaffUserById, updateUser } from '@web/lib/users';


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

    const { id } = ctx.params;
    const user = await getStaffUserById(Number(id));
    if (!user) {
      return { status: 404, body: { success: false, message: 'Staff account not found' } };
    }

    return { status: 200, body: { success: true, user } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;

    const user = await updateUser(Number(id), {
      username: body.username,
      email: body.email,
      firstName: body.firstName,
      lastName: body.lastName,
      role: body.role,
      securityClearance: body.securityClearance,
      phone: body.phone,
      bio: body.bio,
      isActive: body.isActive,
      password: body.password,
    });

    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    return { status: 200, body: { success: true, message: 'User updated', user } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update user';
    return { status: 400, body: { success: false, message } };
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    await deleteUser(Number(id), session.id);

    return { status: 200, body: { success: true, message: 'User deleted' } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete user';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

