import { SystemConfig } from '@cd-v2/database';
import { SecurityHttpKeys } from './http-guard';

export const RecaptchaConfigKeys = {
  siteKey: 'recaptcha_site_key',
  secretKey: 'recaptcha_secret_key',
} as const;

/** v1 default site key (CDynamics reCAPTCHA v2 checkbox) */
const DEFAULT_SITE_KEY = '6Ld4N_krAAAAAHKQTbHareULI0Vf9GUJ9AGvqTdU';

/** Google test keys — always pass; safe for localhost / 127.0.0.1 dev only */
const LOCAL_TEST_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
const LOCAL_TEST_SECRET_KEY = '6LeIxAcTAAAAAGG-vFI1TnRWxMZNFuojJ4WifJWe';

export function isLocalCaptchaHost(host?: string | null): boolean {
  if (!host?.trim()) return false;
  const h = host.trim().toLowerCase().split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h === '::1';
}

/** Legacy v1 toggle — v2 uses `bot_captcha_enabled` but reads both. */
const LEGACY_CAPTCHA_ENABLED_KEY = 'captcha_enabled';

export type PublicCaptchaConfig = {
  enabled: boolean;
  siteKey: string | null;
  /** v1 HTML expects this nested shape */
  captchaConfig: { enabled: boolean; siteKey: string | null };
};

export async function getRecaptchaSiteKey(): Promise<string | null> {
  const fromDb = await SystemConfig.getConfig<string>(RecaptchaConfigKeys.siteKey, null);
  if (fromDb?.trim()) return fromDb.trim();
  return (
    process.env.RECAPTCHA_SITE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY?.trim() ||
    DEFAULT_SITE_KEY
  );
}

export async function getRecaptchaSecretKey(): Promise<string | null> {
  const fromDb = await SystemConfig.getConfig<string>(RecaptchaConfigKeys.secretKey, null);
  if (fromDb?.trim()) return fromDb.trim();
  return process.env.RECAPTCHA_SECRET_KEY?.trim() || null;
}

async function isRecaptchaEnabledInConfig(): Promise<boolean> {
  const modern =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.botCaptchaEnabled, false)) === true;
  if (modern) return true;
  return (await SystemConfig.getConfig<boolean>(LEGACY_CAPTCHA_ENABLED_KEY, false)) === true;
}

export async function isRecaptchaRequired(): Promise<boolean> {
  if (!(await isRecaptchaEnabledInConfig())) return false;
  return Boolean((await getRecaptchaSecretKey()) && (await getRecaptchaSiteKey()));
}

export async function getPublicCaptchaConfig(requestHost?: string | null): Promise<PublicCaptchaConfig> {
  const enabled = await isRecaptchaRequired();
  const localDev = isLocalCaptchaHost(requestHost);
  const siteKey = enabled
    ? localDev
      ? LOCAL_TEST_SITE_KEY
      : await getRecaptchaSiteKey()
    : null;
  return {
    enabled,
    siteKey,
    captchaConfig: { enabled, siteKey },
  };
}

export type CaptchaVerifyResult = {
  ok: boolean;
  message?: string;
  errorCodes?: string[];
};

function formatRecaptchaErrors(codes: string[] | undefined): string {
  if (!codes?.length) {
    return 'CAPTCHA verification failed. Check site key, secret key, and allowed domains in Google reCAPTCHA admin.';
  }
  const hints: Record<string, string> = {
    'invalid-input-secret': 'Secret key is invalid — update it in Settings → Integrations.',
    'invalid-input-response': 'Complete the CAPTCHA again (token missing or expired).',
    'timeout-or-duplicate': 'CAPTCHA expired or already used — check the box again and submit.',
    'browser-error': 'This domain is not allowed for your reCAPTCHA keys (add localhost or your site URL in Google admin).',
    'missing-input-secret': 'Secret key is not configured — save it in Settings → Integrations.',
    'missing-input-response': 'Complete the CAPTCHA before submitting.',
  };
  const parts = codes.map((code) => hints[code] ?? code);
  return parts.join(' ');
}

export async function verifyRecaptchaTokenDetailed(
  token: string | null | undefined,
  remoteIp?: string | null,
  requestHost?: string | null
): Promise<CaptchaVerifyResult> {
  const required = await isRecaptchaRequired();
  if (!required) return { ok: true };
  if (!token?.trim()) {
    return { ok: false, message: 'Complete the CAPTCHA before submitting.', errorCodes: ['missing-input-response'] };
  }

  const secret = isLocalCaptchaHost(requestHost)
    ? LOCAL_TEST_SECRET_KEY
    : await getRecaptchaSecretKey();
  if (!secret) {
    return { ok: false, message: 'CAPTCHA secret key is not configured.', errorCodes: ['missing-input-secret'] };
  }

  try {
    const params = new URLSearchParams({ secret, response: token.trim() });
    if (remoteIp?.trim()) params.set('remoteip', remoteIp.trim());

    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (data.success) return { ok: true };

    const errorCodes = data['error-codes'] ?? [];
    return {
      ok: false,
      message: formatRecaptchaErrors(errorCodes),
      errorCodes,
    };
  } catch {
    return { ok: false, message: 'CAPTCHA verification service unavailable. Try again shortly.' };
  }
}

export async function verifyRecaptchaToken(token: string | null | undefined): Promise<boolean> {
  return (await verifyRecaptchaTokenDetailed(token)).ok;
}

export async function verifyPublicCaptchaDetailed(input: {
  captchaToken?: string | null;
  turnstileToken?: string | null;
  remoteIp?: string | null;
  requestHost?: string | null;
}): Promise<CaptchaVerifyResult> {
  if (await isRecaptchaRequired()) {
    return verifyRecaptchaTokenDetailed(input.captchaToken, input.remoteIp, input.requestHost);
  }
  const { verifyTurnstileToken } = await import('./http-guard');
  const ok = await verifyTurnstileToken(input.turnstileToken);
  return ok
    ? { ok: true }
    : { ok: false, message: 'CAPTCHA verification failed. Complete the challenge and try again.' };
}

export async function verifyPublicCaptcha(input: {
  captchaToken?: string | null;
  turnstileToken?: string | null;
  remoteIp?: string | null;
}): Promise<boolean> {
  return (await verifyPublicCaptchaDetailed(input)).ok;
}

export async function saveRecaptchaSettings(input: {
  siteKey?: string;
  secretKey?: string;
  enabled?: boolean;
}) {
  if (input.siteKey !== undefined) {
    await SystemConfig.setConfig(RecaptchaConfigKeys.siteKey, input.siteKey.trim(), 'string', 'security');
  }
  if (input.secretKey !== undefined && input.secretKey.trim()) {
    await SystemConfig.setConfig(RecaptchaConfigKeys.secretKey, input.secretKey.trim(), 'string', 'security');
  }
  if (input.enabled !== undefined) {
    await SystemConfig.setConfig(SecurityHttpKeys.botCaptchaEnabled, input.enabled, 'boolean', 'security');
    await SystemConfig.setConfig(LEGACY_CAPTCHA_ENABLED_KEY, input.enabled, 'boolean', 'security');
  }
}

export async function getRecaptchaSettingsForAdmin() {
  const [siteKey, secretConfigured, enabled] = await Promise.all([
    getRecaptchaSiteKey(),
    getRecaptchaSecretKey(),
    isRecaptchaEnabledInConfig(),
  ]);

  return {
    enabled,
    siteKey: siteKey ?? '',
    secretConfigured: Boolean(secretConfigured),
  };
}
