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

import { createUser } from '@web/lib/users';
import { getEmailConfig, sendClientWelcomeEmail } from '@web/lib/email';
import { buildPortalUrl } from '@web/lib/site-url';
import { guardPublicFormFromCtx, getRequestPublicOriginFromCtx } from '../../http-helpers';


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
    const body = ctx.body as Record<string, unknown>;
    const blocked = await guardPublicFormFromCtx(ctx, body);
    if (blocked) return blocked;

    const username = String(body.username ?? '').trim();
    const email = String(body.email ?? '').trim();
    const firstName = String(body.firstName ?? '').trim();
    const lastName = String(body.lastName ?? '').trim();

    if (!username || !email || !firstName || !lastName) {
      return { status: 400, body: { success: false, message: 'Username, email, first name, and last name are required' } };
    }

    const result = await createUser({
      username,
      email,
      firstName,
      lastName,
      role: 'client',
      securityClearance: 'S-CLS3',
      phone: body.phone ? String(body.phone) : null,
      isActive: false,
    });

    const emailConfig = await getEmailConfig();
    if (emailConfig.enabled && result.tempPassword) {
      const portalUrl = await buildPortalUrl(getRequestPublicOriginFromCtx(ctx));
      await sendClientWelcomeEmail({
        to: email,
        contactPerson: `${firstName} ${lastName}`.trim(),
        username,
        tempPassword: result.tempPassword,
        portalUrl,
        origin: getRequestPublicOriginFromCtx(ctx),
      });
    }

    return { status: 200, body: {
      success: true,
      message:
        'Account created successfully. A temporary password has been sent to your email address if email is configured.',
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return { status: 400, body: { success: false, message } };
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

