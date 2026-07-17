import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';
import { getConfiguredSiteUrl, isInternalHost, normalizeSiteBaseUrl } from '@/lib/site-url';

export const DEFAULT_SHOWCASE_PORT = 3001;

export type ShowcaseDockFile = {
  port?: number;
  localUrl?: string;
  publicUrl?: string;
  installPath?: string;
  updatedAt?: string;
};

export type ShowcasePortalStatus = {
  available: boolean;
  loginUrl: string | null;
  publicUrl: string | null;
  localUrl: string | null;
  /** When showcase runs locally but public demo URL is not reachable yet. */
  tunnelPending?: boolean;
};

function hostFromOriginOrHost(value: string): string {
  try {
    if (value.includes('://')) return new URL(value).hostname.toLowerCase();
    return value.split(':')[0].toLowerCase();
  } catch {
    return value.split(':')[0].toLowerCase();
  }
}

export function isPublicPortalHost(host: string): boolean {
  const hostname = hostFromOriginOrHost(host);
  if (!hostname || isInternalHost(hostname)) return false;
  if (hostname.startsWith('demo.')) return false;
  return true;
}

export async function probeShowcaseHealth(baseUrl?: string): Promise<boolean> {
  const base = baseUrl ?? getDefaultShowcaseLocalUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);

  try {
    const res = await fetch(`${base}/api/health`, {
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const body = (await res.json()) as HealthPayload;
    if (body.success !== true || body.status !== 'ok') return false;
    if (body.showcase === true) return true;
    if (typeof body.database === 'string' && /showcase/i.test(body.database)) return true;
    return false;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function getShowcasePortalStatus(options?: {
  requestHost?: string | null;
}): Promise<ShowcasePortalStatus> {
  const localUrl = getDefaultShowcaseLocalUrl();
  const publicUrl = getDefaultShowcasePublicUrl();

  if (isShowcaseInstall()) {
    return { available: false, loginUrl: null, publicUrl: null, localUrl: null };
  }

  const localAvailable = await probeShowcaseHealth(localUrl);
  if (!localAvailable) {
    return { available: false, loginUrl: null, publicUrl, localUrl };
  }

  const requestHost = options?.requestHost?.trim() ?? '';
  const visitorOnPublicSite = requestHost ? isPublicPortalHost(requestHost) : false;

  if (!visitorOnPublicSite) {
    return {
      available: true,
      loginUrl: `${localUrl}/login`,
      publicUrl,
      localUrl,
    };
  }

  const publicAvailable = await probeShowcaseHealth(publicUrl);
  if (publicAvailable) {
    return {
      available: true,
      loginUrl: `${publicUrl}/login`,
      publicUrl,
      localUrl,
    };
  }

  return {
    available: false,
    loginUrl: null,
    publicUrl,
    localUrl,
    tunnelPending: true,
  };
}

function showcaseDockPath(): string {
  return path.join(getMonorepoRoot(), 'data', 'showcase-dock.json');
}

export function readShowcaseDockFile(): ShowcaseDockFile | null {
  try {
    const raw = fs.readFileSync(showcaseDockPath(), 'utf8');
    return JSON.parse(raw) as ShowcaseDockFile;
  } catch {
    return null;
  }
}

export function getDefaultShowcaseLocalUrl(port = DEFAULT_SHOWCASE_PORT): string {
  const dock = readShowcaseDockFile();
  if (dock?.localUrl?.trim()) return normalizeSiteBaseUrl(dock.localUrl);
  const configuredPort = dock?.port ?? port;
  return `http://127.0.0.1:${configuredPort}`;
}

/** Derive demo hostname from the live site URL (demo.computerdynamicstt.com). */
export function getDefaultShowcasePublicUrl(): string {
  const dock = readShowcaseDockFile();
  if (dock?.publicUrl?.trim()) return normalizeSiteBaseUrl(dock.publicUrl);

  const explicit = process.env.NEXT_PUBLIC_DEMO_PORTAL_URL?.trim();
  if (explicit) return normalizeSiteBaseUrl(explicit);

  const site = getConfiguredSiteUrl();
  if (site) {
    try {
      const url = new URL(site);
      if (isInternalHost(url.hostname)) {
        return getDefaultShowcaseLocalUrl();
      }
      const host = url.hostname.replace(/^www\./, '');
      return `${url.protocol}//demo.${host}`;
    } catch {
      /* fall through */
    }
  }

  return 'https://demo.computerdynamicstt.com';
}

export function isShowcaseInstall(): boolean {
  return process.env.DEMO_MODE === 'true';
}

type HealthPayload = {
  success?: boolean;
  status?: string;
  showcase?: boolean;
  database?: string;
};
