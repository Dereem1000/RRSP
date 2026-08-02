import { normalizeServicePlanData } from '@/lib/rrsp';

export const RRSP_DEFAULT_LOGO = '/logo.svg';

export type RrspBranding = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyWebsite: string;
  /** Data URL or public path. Empty / default → Computer Dynamics logo. */
  companyLogo: string;
};

export type RrspEmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

export type RrspPortalBranding = {
  logoUrl: string | null;
  hasCustomLogo: boolean;
  companyName: string;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function isCustomRrspLogo(logo: string | null | undefined): boolean {
  const value = String(logo ?? '').trim();
  if (!value) return false;
  if (value === RRSP_DEFAULT_LOGO || value === '/logo.png' || value === '/images/logo.png') {
    return false;
  }
  return true;
}

export function emptyRrspBranding(defaults?: Partial<RrspBranding>): RrspBranding {
  return {
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyWebsite: '',
    companyLogo: RRSP_DEFAULT_LOGO,
    ...defaults,
  };
}

export function emptyRrspEmailSettings(defaults?: Partial<RrspEmailSettings>): RrspEmailSettings {
  return {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    password: '',
    fromName: '',
    fromEmail: '',
    ...defaults,
  };
}

export function parseRrspBranding(
  servicePlanData: unknown,
  client?: { name?: string | null; companyName?: string | null; address?: string | null; phone?: string | null }
): RrspBranding {
  const plan = normalizeServicePlanData(servicePlanData);
  const raw = asRecord(plan.rrspBranding);
  const companyName =
    String(raw.companyName ?? '').trim() ||
    String(client?.companyName ?? client?.name ?? '').trim();
  const companyLogo = String(raw.companyLogo ?? '').trim() || RRSP_DEFAULT_LOGO;
  return {
    companyName,
    // Empty Business-info fields fall back to the client account address/phone.
    companyAddress: String(raw.companyAddress ?? '').trim() || String(client?.address ?? '').trim(),
    companyPhone: String(raw.companyPhone ?? '').trim() || String(client?.phone ?? '').trim(),
    companyWebsite: String(raw.companyWebsite ?? '').trim(),
    companyLogo,
  };
}

export function parseRrspEmailSettings(servicePlanData: unknown): RrspEmailSettings {
  const plan = normalizeServicePlanData(servicePlanData);
  const raw = asRecord(plan.rrspEmail);
  return emptyRrspEmailSettings({
    enabled: Boolean(raw.enabled),
    host: String(raw.host ?? '').trim(),
    port: Number(raw.port) || 587,
    secure: Boolean(raw.secure),
    user: String(raw.user ?? '').trim(),
    password: String(raw.password ?? ''),
    fromName: String(raw.fromName ?? '').trim(),
    fromEmail: String(raw.fromEmail ?? '').trim(),
  });
}

export function maskRrspEmailSettings(email: RrspEmailSettings): RrspEmailSettings {
  return {
    ...email,
    password: email.password ? '********' : '',
  };
}

export function rrspEmailIsReady(email: RrspEmailSettings): boolean {
  return Boolean(
    email.enabled && email.host && email.user && email.password && (email.fromEmail || email.user)
  );
}

/** Human-readable gaps that block RRSP SMTP send/test. */
export function describeRrspEmailGaps(email: RrspEmailSettings | null | undefined): string[] {
  if (!email) return ['SMTP settings are not saved yet'];
  const gaps: string[] = [];
  if (!email.enabled) gaps.push('Enable shop email');
  if (!email.host.trim()) gaps.push('SMTP host');
  if (!email.user.trim()) gaps.push('Username');
  if (!email.password || email.password === '********') gaps.push('Password');
  if (!email.fromEmail.trim() && !email.user.trim()) gaps.push('From email');
  return gaps;
}

/** Merge saved settings with an optional form payload (keeps stored password when masked/blank). */
export function mergeRrspEmailSettings(
  saved: RrspEmailSettings,
  patch?: Partial<RrspEmailSettings> | null
): RrspEmailSettings {
  if (!patch) return { ...saved };
  const passwordRaw = patch.password !== undefined ? String(patch.password) : undefined;
  const password =
    passwordRaw === undefined || passwordRaw === '' || passwordRaw === '********'
      ? saved.password
      : passwordRaw;
  return emptyRrspEmailSettings({
    enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : saved.enabled,
    host: patch.host !== undefined ? String(patch.host).trim() : saved.host,
    port: patch.port !== undefined ? Number(patch.port) || 587 : saved.port,
    secure: patch.secure !== undefined ? Boolean(patch.secure) : saved.secure,
    user: patch.user !== undefined ? String(patch.user).trim() : saved.user,
    password,
    fromName: patch.fromName !== undefined ? String(patch.fromName).trim() : saved.fromName,
    fromEmail: patch.fromEmail !== undefined ? String(patch.fromEmail).trim() : saved.fromEmail,
  });
}
