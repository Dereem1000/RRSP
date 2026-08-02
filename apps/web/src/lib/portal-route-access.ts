import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalRouteRoles } from '@/lib/portal-nav';
import { requireRrspModule, rrspModuleForPathname } from '@/lib/rrsp-access';

export function portalPathnameFromHeaders(headerStore: Headers): string {
  const raw = headerStore.get('x-cd-return-path') ?? '/dashboard';
  return raw.split('?')[0] || '/dashboard';
}

/** Enforce the same role gates as sidebar nav — blocks direct URL access when gated. */
export async function requirePortalRouteAccess(user: { id: number; role: string }): Promise<void> {
  const headerStore = await headers();
  const pathname = portalPathnameFromHeaders(headerStore);

  const rrspModule = rrspModuleForPathname(pathname);
  if (rrspModule) {
    await requireRrspModule(user, rrspModule);
    return;
  }

  if (pathname === '/billing' && user.role !== 'client') {
    redirect('/accounting');
  }

  const roles = getPortalRouteRoles(pathname);
  if (roles && !roles.includes(user.role)) {
    redirect('/dashboard');
  }
}
