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
import { getClientIpFromCtx, getRequestHostFromCtx } from '../../http-helpers';

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
  // Bot / IDS / rate limits: Express `expressRequestGuard` (avoid double rate-limit).

  const body = ctx.body as Record<string, unknown>;
  const { username, password, turnstileToken, captchaToken, website, demoProduct } = body;

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
    const { resolveRrspShopLoginUser } = await import('@web/lib/rrsp-shop-staff');

    const rawUsername = String(username).trim();
    const at = rawUsername.lastIndexOf('@');
    const domainPart = at > 0 ? rawUsername.slice(at + 1) : '';
    // shop@slug (no TLD) — resolve before generic email/username lookup
    const looksLikeShopStaffLogin = at > 0 && domainPart && !domainPart.includes('.');

    let user: InstanceType<typeof User> | null = null;

    if (looksLikeShopStaffLogin) {
      user = await resolveRrspShopLoginUser(rawUsername);
    }

    if (!user) {
      user = await User.findOne({
        where: { [Op.or]: [{ username: rawUsername }, { email: rawUsername }] },
      });
    }

    if (!user && rawUsername.includes('@')) {
      user = await resolveRrspShopLoginUser(rawUsername);
    }

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
      if (user.role === 'admin') {
        await logSecurityEvent({
          eventType: 'admin_login',
          severity: user.securityClearance === 'S-CLS1' ? 'high' : 'medium',
          description: `Admin login (temp password): ${username} (${user.securityClearance})`,
          userId: user.id,
          outcome: 'success',
          ipAddress: ip,
          details: { role: user.role, clearance: user.securityClearance, tempPassword: true },
        });
      }
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

    if (user.role === 'admin') {
      await logSecurityEvent({
        eventType: 'admin_login',
        severity: user.securityClearance === 'S-CLS1' ? 'high' : 'medium',
        description: `Admin login: ${username} (${user.securityClearance})`,
        userId: user.id,
        outcome: 'success',
        ipAddress: ip,
        details: { role: user.role, clearance: user.securityClearance },
      });
    }

    const token = signToken({ id: user.id, role: user.role, clearance: user.securityClearance });

    const demoKey = String(demoProduct ?? '').trim().toLowerCase();
    if (demoKey === 'rrms') {
      try {
        const { getClientRrspAccess } = await import('@web/lib/rrsp-access');
        const { enableRrspShopDemo } = await import('@web/lib/rrsp-demo');
        const access = await getClientRrspAccess(user.id);
        const mspClientId = access.mspClientId;
        if (mspClientId && (access.isShopOwner || access.isShopStaff)) {
          await enableRrspShopDemo(mspClientId);
        }
      } catch (demoErr) {
        console.error('[login] RRMS demo enable failed:', demoErr);
      }
    }

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

