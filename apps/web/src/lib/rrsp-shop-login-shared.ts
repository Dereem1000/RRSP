/** Client-safe RRMS shop login helpers (no database / Node-only imports). */

export type RrspShopLoginPublicInfo = {
  companyName: string;
  logoUrl: string | null;
  hasCustomLogo: boolean;
  staffLoginEnabled: boolean;
  shopLoginSlug: string;
};

export function normalizeRrspShopLoginSlug(value: string): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '')
    .replace(/-+/g, '')
    .toLowerCase()
    .slice(0, 48);
}

export function shopStaffLoginPath(slug: string | null | undefined): string {
  const normalized = slug ? normalizeRrspShopLoginSlug(slug) : '';
  return normalized ? `/login/shop/${encodeURIComponent(normalized)}` : '/login';
}

/** Absolute shop sign-in URL for welcome emails (falls back to generic /login). */
export function buildRrmsShopLoginUrl(
  portalLoginUrl: string,
  slug: string | null | undefined
): string {
  const normalized = slug ? normalizeRrspShopLoginSlug(slug) : '';
  if (!normalized) return portalLoginUrl;
  const base = portalLoginUrl.replace(/\/login\/?$/, '');
  return `${base}${shopStaffLoginPath(normalized)}`;
}

/** Post sign-out destination for RRMS shop portal users (owner or staff). */
export function shopPortalLogoutPath(slug: string | null | undefined): string {
  return shopStaffLoginPath(slug);
}
