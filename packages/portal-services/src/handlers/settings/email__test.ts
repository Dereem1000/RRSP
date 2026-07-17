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

import { User } from '@web/lib/db';
import { sendAllTemplateTestEmails } from '@web/lib/email-test';
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

    const body = ctx.body as Record<string, unknown>;
    const admin = await User.findByPk(session.id, { attributes: ['email'] });
    const to = body.to || admin?.email;
    if (!to) {
      return { status: 400, body: { success: false, message: 'No recipient email provided' } };
    }

    const connection = await testEmailConnection();
    if (!connection.success) {
      return { status: 400, body: { success: false, message: connection.message } };
    }

    const result = await sendAllTemplateTestEmails(to, getRequestPublicOriginFromCtx(ctx));

    return { status: 200, body: {
      success: result.failed === 0,
      message:
        result.failed === 0
          ? `Sent ${result.emailCount} bundled test emails (${result.templateCount} template previews) to ${to}`
          : `Sent ${result.sent} of ${result.total} bundled emails (${result.templateCount} previews). Failed: ${result.errors.join(', ')}`,
      ...result,
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

