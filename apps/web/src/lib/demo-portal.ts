import { getConfiguredSiteUrl, normalizeSiteBaseUrl } from '@/lib/site-url';

/** Public demo portal (separate deployment at demo.<domain>). */
export function getDemoPortalUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_DEMO_PORTAL_URL?.trim();
  if (explicit) return normalizeSiteBaseUrl(explicit);

  const site = getConfiguredSiteUrl();
  if (site) {
    try {
      const url = new URL(site);
      const host = url.hostname.replace(/^www\./, '');
      return `${url.protocol}//demo.${host}`;
    } catch {
      /* fall through */
    }
  }

  return 'https://demo.computerdynamicstt.com';
}

/** Hide on the demo site itself; show on the live production login page. */
export function shouldShowDemoPortalLink(): boolean {
  return process.env.DEMO_MODE !== 'true';
}

export function getDemoPortalLoginUrl(): string {
  return `${getDemoPortalUrl()}/login`;
}
