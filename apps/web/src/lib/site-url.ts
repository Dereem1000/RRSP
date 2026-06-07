import type { NextRequest } from 'next/server';
import { getCompanySettings } from '@/lib/company-settings';

export function normalizeSiteBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

export function isInternalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === '0.0.0.0' || host === '127.0.0.1' || host === 'localhost' || host === '::1') {
    return true;
  }
  if (host.startsWith('192.168.') || host.startsWith('10.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) {
    return true;
  }
  return host.endsWith('.local');
}

export function isUsablePublicOrigin(origin?: string | null): origin is string {
  if (!origin?.trim()) return false;
  try {
    return !isInternalHost(new URL(origin).hostname);
  } catch {
    return false;
  }
}

export function getConfiguredSiteUrl(): string | null {
  const site = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  return site?.trim() ? normalizeSiteBaseUrl(site) : null;
}

/** Prefer forwarded/public host headers over raw nextUrl.origin (which may be 0.0.0.0). */
export function getRequestPublicOrigin(req: NextRequest): string | undefined {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const rawHost = forwardedHost?.split(',')[0]?.trim() || req.headers.get('host')?.trim();

  if (rawHost) {
    const hostname = rawHost.split(':')[0];
    if (!isInternalHost(hostname)) {
      const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
      return `${proto}://${rawHost}`;
    }
  }

  return isUsablePublicOrigin(req.nextUrl.origin) ? req.nextUrl.origin : undefined;
}

export async function resolvePublicSiteBaseUrl(requestOrigin?: string): Promise<string> {
  const configured = getConfiguredSiteUrl();
  if (configured) return configured;

  if (isUsablePublicOrigin(requestOrigin)) {
    return normalizeSiteBaseUrl(requestOrigin);
  }

  const company = await getCompanySettings();
  const website = company.companyWebsite?.trim();
  if (website) {
    const url = website.startsWith('http') ? website : `https://${website}`;
    return normalizeSiteBaseUrl(url);
  }

  return 'http://localhost:3000';
}

export async function buildPortalUrl(requestOrigin?: string): Promise<string> {
  const base = await resolvePublicSiteBaseUrl(requestOrigin);
  return `${base}/login`;
}
