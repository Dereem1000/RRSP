// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';

import {
  LICENSE_SERIAL_REVEAL_COOKIE,
  signLicenseSerialRevealToken,
  verifyStaffPassword,
} from '@web/lib/license-serial-access';

const REVEAL_MAX_AGE_MS = 15 * 60 * 1000;

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return { status: 400, body: { success: false, message: 'Password is required' } };
    }

    const valid = await verifyStaffPassword(session.id, password);
    if (!valid) {
      return { status: 401, body: { success: false, message: 'Incorrect password' } };
    }

    const token = signLicenseSerialRevealToken(session.id);
    return {
      status: 200,
      body: {
        success: true,
        token,
        expiresInSeconds: 15 * 60,
        message: 'License serials unlocked for 15 minutes',
      },
      cookies: [
        {
          name: LICENSE_SERIAL_REVEAL_COOKIE,
          value: token,
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: REVEAL_MAX_AGE_MS,
        },
      ],
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
