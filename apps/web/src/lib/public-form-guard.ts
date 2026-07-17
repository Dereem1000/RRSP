import { NextRequest, NextResponse } from 'next/server';
import { verifyPublicCaptchaDetailed } from '@cd-v2/security';
import { applyRequestGuard, getClientIp, getRequestHost } from '@/lib/with-security';

export async function guardPublicForm(
  req: NextRequest,
  body: { captchaToken?: string; turnstileToken?: string; website?: string }
): Promise<NextResponse | null> {
  const guardRes = await applyRequestGuard(req);
  if (guardRes) return guardRes;

  if (body.website?.trim()) {
    return NextResponse.json({ success: false, message: 'Request blocked' }, { status: 403 });
  }

  const captcha = await verifyPublicCaptchaDetailed({
    captchaToken: body.captchaToken,
    turnstileToken: body.turnstileToken,
    remoteIp: getClientIp(req),
    requestHost: getRequestHost(req),
  });
  if (!captcha.ok) {
    return NextResponse.json(
      {
        success: false,
        message: captcha.message ?? 'CAPTCHA verification failed. Please complete the CAPTCHA and try again.',
        captchaErrorCodes: captcha.errorCodes,
      },
      { status: 400 }
    );
  }

  return null;
}
