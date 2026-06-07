import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, guardRequest, logLicenseValidateAttempt } from '@cd-v2/security';
import { getClientIp } from '@/lib/with-security';

export async function guardLicenseValidateRequest(
  req: NextRequest,
  bodyText: string
): Promise<NextResponse | null> {
  const ip = getClientIp(req);
  const url = new URL(req.url);

  let serial: string | undefined;
  let honeypot: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as { serial_number?: string; serialNumber?: string; website?: string };
    serial = parsed.serial_number ?? parsed.serialNumber;
    honeypot = parsed.website;
  } catch {
    /* non-json body */
  }

  const guard = await guardRequest({
    ip,
    path: '/api/license/validate',
    method: 'POST',
    userAgent: req.headers.get('user-agent'),
    acceptLanguage: req.headers.get('accept-language'),
    query: url.search,
    honeypot,
  });
  if (!guard.allow) {
    await logLicenseValidateAttempt({
      ip,
      serial,
      success: false,
      blocked: true,
      message: guard.reason,
    });
    return NextResponse.json(
      { success: false, valid: false, message: guard.reason ?? 'Forbidden' },
      { status: guard.logType === 'rate_limited' ? 429 : 403 }
    );
  }

  const rateKey = `license-validate:${ip}:${serial ?? 'unknown'}`;
  if (!checkRateLimit(rateKey, 60, 60_000)) {
    await logLicenseValidateAttempt({
      ip,
      serial,
      success: false,
      blocked: true,
      message: 'Rate limit exceeded',
    });
    return NextResponse.json(
      { success: false, valid: false, message: 'Too many validation attempts' },
      { status: 429 }
    );
  }

  return null;
}

export async function logLicenseValidateResult(
  req: NextRequest,
  bodyText: string,
  responseText: string,
  status: number
) {
  const ip = getClientIp(req);
  let serial: string | undefined;
  try {
    const parsed = JSON.parse(bodyText) as { serial_number?: string; serialNumber?: string };
    serial = parsed.serial_number ?? parsed.serialNumber;
  } catch {
    /* ignore */
  }

  let success = status >= 200 && status < 300;
  try {
    const resBody = JSON.parse(responseText) as { valid?: boolean; success?: boolean };
    if (typeof resBody.valid === 'boolean') success = resBody.valid;
    else if (typeof resBody.success === 'boolean') success = resBody.success;
  } catch {
    success = false;
  }

  await logLicenseValidateAttempt({ ip, serial, success, message: `HTTP ${status}` });
}
