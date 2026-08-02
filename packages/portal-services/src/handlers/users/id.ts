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
import { logSecurityEvent } from '@cd-v2/security';
import { getClientIpFromCtx } from '../../http-helpers';


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
    const before = await getStaffUserById(Number(id));

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

    if (before) {
      const roleChanged = body.role !== undefined && before.role !== user.role;
      const clearanceChanged =
        body.securityClearance !== undefined && before.securityClearance !== user.securityClearance;
      const activeChanged = body.isActive !== undefined && before.isActive !== user.isActive;
      if (roleChanged || clearanceChanged || activeChanged) {
        await logSecurityEvent({
          eventType: 'privilege_change',
          severity: 'high',
          description: `Staff privileges changed for ${user.username} by user #${session.id}`,
          userId: session.id,
          ipAddress: getClientIpFromCtx(ctx),
          details: {
            targetUserId: user.id,
            before: {
              role: before.role,
              securityClearance: before.securityClearance,
              isActive: before.isActive,
            },
            after: {
              role: user.role,
              securityClearance: user.securityClearance,
              isActive: user.isActive,
            },
          },
          skipDedup: true,
        });
      }
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

