// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  SESSION_COOKIE_MAX_AGE_MS,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { logSecurityEvent, verifyPublicCaptchaDetailed } from '@cd-v2/security';
import { User, SystemConfig, publicUser } from '@web/lib/db';
import { applyRequestGuardFromCtx, getClientIpFromCtx, getRequestHostFromCtx } from '../../http-helpers';

async function logLoginAttempt(
  outcome: 'success' | 'blocked',
  ip: string,
  username: string,
  userId?: number
) {
  await logSecurityEvent({
    eventType: 'login_attempt',
    severity: outcome === 'success' ? 'low' : 'medium',
    description: `Login ${outcome}: ${username}`,
    outcome,
    userId: userId ?? null,
    ipAddress: ip,
  });
}
function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


async function isProductInstallerRequest(ctx: ApiContext): Promise<boolean> {
  try {
    const auth = await requireMspApiAuth(ctx);
    return auth.type === 'token';
  } catch {
    return false;
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  const ip = getClientIpFromCtx(ctx);
  const guardRes = await applyRequestGuardFromCtx(ctx);
  if (guardRes) return guardRes;

  const body = ctx.body as Record<string, unknown>;
  const { username, password, turnstileToken, captchaToken, website } = body;

  if (website?.trim()) {
    await logLoginAttempt('blocked', ip, username ?? 'unknown');
    return { status: 401, body: { success: false, message: 'Invalid credentials' } };
  }

  // Product installers (POS, CRM, etc.) authenticate server-to-server with the MSP/license
  // API bearer token — captcha is for browser logins only.
  const productInstaller = await isProductInstallerRequest(ctx);
  if (!productInstaller) {
    const captcha = await verifyPublicCaptchaDetailed({
      captchaToken,
      turnstileToken,
      remoteIp: ip,
      requestHost: getRequestHostFromCtx(ctx),
    });
    if (!captcha.ok) {
      return { status: 400, body: {
          success: false,
          message: captcha.message ?? 'CAPTCHA verification failed',
          captchaErrorCodes: captcha.errorCodes,
        } };
    }
  }

  if (!username || !password) {
    return { status: 400, body: { success: false, message: 'Username and password required' } };
  }

  try {
    const maintenanceMode = await SystemConfig.getConfig<boolean>('maintenance_mode', false);
    const user = await User.findOne({
      where: { [Op.or]: [{ username }, { email: username }] },
    });

    if (maintenanceMode && (!user || user.role !== 'admin')) {
      return { status: 503, body: {
          success: false,
          message: 'System is currently under maintenance. Please try again later.',
          maintenance_mode: true,
        } };
    }

    if (!user) {
      await logLoginAttempt('blocked', ip, username);
      return { status: 401, body: { success: false, message: 'Invalid credentials' } };
    }

    if (user.tempPassword && !user.passwordSet) {
      const tempValid = await bcrypt.compare(password, user.tempPassword);
      if (!tempValid) {
        await user.incrementFailedLoginAttempts();
        await logLoginAttempt('blocked', ip, username, user.id);
        return { status: 401, body: { success: false, message: 'Invalid credentials' } };
      }
      await user.resetFailedLoginAttempts();
      await user.updateLastLogin();
      const token = signToken({ id: user.id, role: user.role, clearance: user.securityClearance });
      await logLoginAttempt('success', ip, username, user.id);
      return { status: 200, body: {
        success: true,
        user: publicUser(user),
        requiresPasswordSetup: true,
      }, cookies: [{ name: COOKIE_NAME, value: token, httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_COOKIE_MAX_AGE_MS }] };
    }

    if (!user.isActive) {
      await logLoginAttempt('blocked', ip, username, user.id);
      return { status: 401, body: { success: false, message: 'Invalid credentials' } };
    }

    const valid = await user.validatePassword(password);
    if (!valid) {
      await user.incrementFailedLoginAttempts();
      await logLoginAttempt('blocked', ip, username, user.id);
      return { status: 401, body: { success: false, message: 'Invalid credentials' } };
    }

    await user.resetFailedLoginAttempts();
    await user.updateLastLogin();
    await logLoginAttempt('success', ip, username, user.id);

    const token = signToken({ id: user.id, role: user.role, clearance: user.securityClearance });
    return { status: 200, body: { success: true, user: publicUser(user) }, cookies: [{ name: COOKIE_NAME, value: token, httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_COOKIE_MAX_AGE_MS }] };
  } catch (error) {
    console.error('Login error:', error);
    return { status: 500, body: { success: false, message: 'Login error' } };
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

