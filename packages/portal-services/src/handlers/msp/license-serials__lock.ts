// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';

import { LICENSE_SERIAL_REVEAL_COOKIE } from '@web/lib/license-serial-access';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    return {
      status: 200,
      body: { success: true, message: 'License serials hidden' },
      cookies: [
        {
          name: LICENSE_SERIAL_REVEAL_COOKIE,
          value: '',
          httpOnly: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 0,
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
