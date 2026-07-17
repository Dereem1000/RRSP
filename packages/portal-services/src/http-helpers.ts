import { guardRequest, verifyPublicCaptchaDetailed } from '@cd-v2/security';
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  LICENSE_SERIAL_REVEAL_COOKIE,
  LICENSE_SERIAL_REVEAL_HEADER,
} from '@web/lib/license-constants';
import { verifyLicenseSerialRevealToken } from '@web/lib/license-serial-access';
import type { WiPayResponseParams } from '@web/lib/wipay';

export function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}

export function getClientIpFromCtx(ctx: ApiContext): string {
  return (
    ctx.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    ctx.header('x-real-ip') ||
    'unknown'
  );
}

export function getRequestHostFromCtx(ctx: ApiContext): string | null {
  return ctx.header('x-forwarded-host')?.split(',')[0]?.trim() || ctx.header('host') || null;
}

export function getRequestPublicOriginFromCtx(ctx: ApiContext): string {
  const host = getRequestHostFromCtx(ctx);
  const proto = ctx.header('x-forwarded-proto')?.split(',')[0]?.trim() || 'http';
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000';
}

export async function applyRequestGuardFromCtx(ctx: ApiContext): Promise<ApiResult | null> {
  const guard = await guardRequest({
    ip: getClientIpFromCtx(ctx),
    path: ctx.urlPath,
    method: ctx.method,
    userAgent: ctx.header('user-agent'),
    acceptLanguage: ctx.header('accept-language'),
    query: new URLSearchParams(
      Object.entries(ctx.query).flatMap(([key, value]) => {
        if (value === undefined) return [];
        if (Array.isArray(value)) return value.map((v) => [key, v]);
        return [[key, value]];
      }) as [string, string][]
    ).toString(),
  });
  if (!guard.allow) {
    return {
      status: guard.logType === 'rate_limited' ? 429 : 403,
      body: { success: false, message: guard.reason ?? 'Forbidden' },
    };
  }
  return null;
}

export function licenseSerialsRevealedFromCtx(ctx: ApiContext, sessionUserId: number): boolean {
  const headerToken = ctx.header(LICENSE_SERIAL_REVEAL_HEADER)?.trim();
  if (headerToken && verifyLicenseSerialRevealToken(headerToken) === sessionUserId) {
    return true;
  }
  const auth = ctx.header('authorization');
  if (auth?.startsWith('Bearer ')) {
    const uid = verifyLicenseSerialRevealToken(auth.slice(7).trim());
    if (uid === sessionUserId) return true;
  }
  const cookie = ctx.cookies?.[LICENSE_SERIAL_REVEAL_COOKIE];
  if (cookie && verifyLicenseSerialRevealToken(decodeURIComponent(cookie)) === sessionUserId) {
    return true;
  }
  return false;
}

export async function guardPublicFormFromCtx(
  ctx: ApiContext,
  body: { captchaToken?: string; turnstileToken?: string; website?: string }
): Promise<ApiResult | null> {
  const guard = await applyRequestGuardFromCtx(ctx);
  if (guard) return guard;

  if (body.website?.trim()) {
    return { status: 403, body: { success: false, message: 'Request blocked' } };
  }

  const captcha = await verifyPublicCaptchaDetailed({
    captchaToken: body.captchaToken,
    turnstileToken: body.turnstileToken,
    remoteIp: getClientIpFromCtx(ctx),
    requestHost: getRequestHostFromCtx(ctx),
  });
  if (!captcha.ok) {
    return {
      status: 400,
      body: {
        success: false,
        message:
          captcha.message ?? 'CAPTCHA verification failed. Please complete the CAPTCHA and try again.',
        captchaErrorCodes: captcha.errorCodes,
      },
    };
  }

  return null;
}

export function wipayParamsFromCtx(ctx: ApiContext): WiPayResponseParams {
  const searchParams = searchParamsFrom(ctx);
  return {
    status: searchParams.get('status') ?? undefined,
    transaction_id: searchParams.get('transaction_id') ?? undefined,
    order_id: searchParams.get('order_id') ?? undefined,
    total: searchParams.get('total') ?? undefined,
    hash: searchParams.get('hash') ?? undefined,
    message: searchParams.get('message') ?? undefined,
    data: searchParams.get('data') ?? undefined,
  };
}

export function redirectResult(location: string, status = 302): ApiResult {
  return { status, body: '', rawBody: '', headers: { Location: location } };
}
