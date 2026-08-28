import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPortalRouteRoles } from '@/lib/portal-nav';
import {
  firstRrspModuleHref,
  getClientRrspAccess,
  requireRrspModule,
  rrspModuleForPathname,
} from '@/lib/rrsp-access';
import { clientHasPlatformLicenses } from '@/lib/client-platform-deliverables';

export function portalPathnameFromHeaders(headerStore: Headers): string {
  const raw = headerStore.get('x-cd-return-path') ?? '/dashboard';
  return raw.split('?')[0] || '/dashboard';
}

/** Enforce the same role gates as sidebar nav — blocks direct URL access when gated. */
export async function requirePortalRouteAccess(user: { id: number; role: string }): Promise<void> {
  const headerStore = await headers();
  const pathname = portalPathnameFromHeaders(headerStore);

  const rrspAccess =
    user.role === 'client' ? await getClientRrspAccess(user.id) : null;

  if (rrspAccess?.isShopStaff) {
    if (pathname === '/rrsp') return;
    if (!pathname.startsWith('/rrsp/')) {
      redirect('/rrsp');
    }
    const rrspModule = rrspModuleForPathname(pathname);
    if (rrspModule) {
      await requireRrspModule(user, rrspModule);
    }
    return;
  }

  const rrspModule = rrspModuleForPathname(pathname);
  if (rrspModule) {
    await requireRrspModule(user, rrspModule);
    return;
  }

  if (pathname === '/billing' && user.role !== 'client') {
    redirect('/accounting');
  }

  if (pathname === '/deliverables' || pathname.startsWith('/deliverables/')) {
    if (user.role !== 'client') {
      redirect('/dashboard');
    }
    const allowed = await clientHasPlatformLicenses(user.id);
    if (!allowed) {
      redirect('/dashboard');
    }
    return;
  }

  const roles = getPortalRouteRoles(pathname);
  if (roles && !roles.includes(user.role)) {
    redirect('/dashboard');
  }
}
