import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import {
  logSecurityEvent,
  verifyTurnstileToken,
} from '@cd-v2/security';
import { User, SystemConfig, publicUser } from '@/lib/db';
import { signToken, COOKIE_NAME } from '@/lib/jwt';
import { applyRequestGuard, getClientIp } from '@/lib/with-security';

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

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const guardRes = await applyRequestGuard(req);
  if (guardRes) return guardRes;

  const body = await req.json();
  const { username, password, turnstileToken, website } = body;

  if (website?.trim()) {
    await logLoginAttempt('blocked', ip, username ?? 'unknown');
    return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
  }

  const captchaOk = await verifyTurnstileToken(turnstileToken);
  if (!captchaOk) {
    return NextResponse.json(
      { success: false, message: 'CAPTCHA verification failed' },
      { status: 400 }
    );
  }

  if (!username || !password) {
    return NextResponse.json(
      { success: false, message: 'Username and password required' },
      { status: 400 }
    );
  }

  try {
    const maintenanceMode = await SystemConfig.getConfig<boolean>('maintenance_mode', false);
    const user = await User.findOne({
      where: { [Op.or]: [{ username }, { email: username }] },
    });

    if (maintenanceMode && (!user || user.role !== 'admin')) {
      return NextResponse.json(
        {
          success: false,
          message: 'System is currently under maintenance. Please try again later.',
          maintenance_mode: true,
        },
        { status: 503 }
      );
    }

    if (!user) {
      await logLoginAttempt('blocked', ip, username);
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    if (user.tempPassword && !user.passwordSet) {
      const tempValid = await bcrypt.compare(password, user.tempPassword);
      if (!tempValid) {
        await user.incrementFailedLoginAttempts();
        await logLoginAttempt('blocked', ip, username, user.id);
        return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
      }
      await user.resetFailedLoginAttempts();
      await user.updateLastLogin();
      const token = signToken({ id: user.id, role: user.role, clearance: user.securityClearance });
      await logLoginAttempt('success', ip, username, user.id);
      const res = NextResponse.json({
        success: true,
        user: publicUser(user),
        requiresPasswordSetup: true,
      });
      res.cookies.set(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24,
      });
      return res;
    }

    if (!user.isActive) {
      await logLoginAttempt('blocked', ip, username, user.id);
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    const valid = await user.validatePassword(password);
    if (!valid) {
      await user.incrementFailedLoginAttempts();
      await logLoginAttempt('blocked', ip, username, user.id);
      return NextResponse.json({ success: false, message: 'Invalid credentials' }, { status: 401 });
    }

    await user.resetFailedLoginAttempts();
    await user.updateLastLogin();
    await logLoginAttempt('success', ip, username, user.id);

    const token = signToken({ id: user.id, role: user.role, clearance: user.securityClearance });
    const res = NextResponse.json({ success: true, user: publicUser(user) });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    });
    return res;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ success: false, message: 'Login error' }, { status: 500 });
  }
}
