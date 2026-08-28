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

import { Client } from '@web/lib/db';
import { resendWelcomeForClient } from '@web/lib/clients';
import { buildPortalUrl, getRequestPublicOrigin } from '@web/lib/site-url';
import { getRequestPublicOriginFromCtx } from '../../http-helpers';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const client = await Client.findByPk(id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    const result = await resendWelcomeForClient(client, await buildPortalUrl(getRequestPublicOriginFromCtx(ctx)));

    return { status: 200, body: {
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
    } };
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

