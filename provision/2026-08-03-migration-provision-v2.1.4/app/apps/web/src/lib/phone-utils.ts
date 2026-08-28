export const TT_PHONE_PREFIX_DISPLAY = '1 (868)';

const CANONICAL_PHONE_RE = /^\+1-868-\d{3}-\d{4}$/;

export function formatLocalPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 7);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export function parsePhoneToLocal(phone: string | null | undefined): string {
  if (!phone) return '';
  let digits = phone.replace(/\D/g, '');
  // Strip country code prefixes (1868, 868, or 1 followed by 868)
  if (digits.startsWith('1868')) digits = digits.slice(4);
  else if (digits.startsWith('868')) digits = digits.slice(3);
  else if (digits.startsWith('1') && digits.length > 1) digits = digits.slice(1).replace(/^868/, '');
  return formatLocalPhoneInput(digits.slice(0, 7));
}

export function buildFullPhone(local: string): string {
  const digits = local.replace(/\D/g, '').slice(0, 7);
  if (!digits) return '';
  return `+1-868-${formatLocalPhoneInput(digits)}`;
}

export function isCompleteLocalPhone(local: string): boolean {
  return local.replace(/\D/g, '').length === 7;
}

/** True when the value looks like a Trinidad & Tobago number (868 area or 7-digit local). */
export function isTrinidadPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!trimmed) return false;
  if (/868/i.test(trimmed)) return true;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 7) return true;
  if (digits.startsWith('868') && digits.length === 10) return true;
  if (digits.startsWith('1868') && digits.length === 11) return true;
  return false;
}

/** Normalize stored T&T numbers to +1-868-XXX-XXXX; leave other formats unchanged. */
export function normalizeStoredPhone(phone: string | null | undefined): string | null {
  if (phone == null) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (CANONICAL_PHONE_RE.test(trimmed)) return trimmed;
  if (!isTrinidadPhone(trimmed)) return trimmed;

  const localDigits = parsePhoneToLocal(trimmed).replace(/\D/g, '');
  if (localDigits.length !== 7) return trimmed;

  return buildFullPhone(localDigits);
}
