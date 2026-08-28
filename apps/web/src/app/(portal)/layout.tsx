import { requirePortalUser } from '@/lib/session';
import { getGeneralSettings } from '@/lib/settings';
import { getClientRrspAccess } from '@/lib/rrsp-access';
import { getRrspPortalBranding } from '@/lib/rrsp-branding';
import { isRrspShopDemoActive } from '@/lib/rrsp-demo';
import { requirePortalRouteAccess } from '@/lib/portal-route-access';
import { clientHasPlatformLicenses } from '@/lib/client-platform-deliverables';
import {
  countPendingIncomingPartsRequests,
  resolveStockOwnerForViewer,
} from '@/lib/parts-catalog';
import { PortalShell } from '@/components/PortalShell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [{ user }, general] = await Promise.all([requirePortalUser(), getGeneralSettings()]);
  await requirePortalRouteAccess(user);
  const rrspAccess =
    user.role === 'client'
      ? await getClientRrspAccess(user.id)
      : null;

  const clientPlatformLicenses =
    user.role === 'client' ? await clientHasPlatformLicenses(user.id) : false;

  const shopBranding =
    rrspAccess?.featureEnabled && rrspAccess.licenseActive && rrspAccess.mspClientId
      ? await getRrspPortalBranding(rrspAccess.mspClientId).catch(() => null)
      : null;

  const shopDemoMode =
    rrspAccess?.featureEnabled && rrspAccess.licenseActive && rrspAccess.mspClientId
      ? await isRrspShopDemoActive(rrspAccess.mspClientId).catch(() => false)
      : false;

  let partsIncomingBadge = 0;
  if (user.role === 'client' || user.role === 'admin' || user.role === 'technician') {
    try {
      const stockOwner = await resolveStockOwnerForViewer(user.role, user.id);
      if (stockOwner?.id) {
        partsIncomingBadge = await countPendingIncomingPartsRequests(stockOwner.id);
      }
    } catch {
      partsIncomingBadge = 0;
    }
  }

  return (
    <PortalShell
      user={user}
      demoMode={general.demoMode}
      partsIncomingBadge={partsIncomingBadge}
      rrspAccess={
        rrspAccess
          ? {
              featureEnabled: rrspAccess.featureEnabled,
              enabled: rrspAccess.enabled,
              modules: rrspAccess.modules,
              needsContact: rrspAccess.needsContact,
              licenseActive: rrspAccess.licenseActive,
              isShopOwner: rrspAccess.isShopOwner,
              isShopStaff: rrspAccess.isShopStaff,
              portalDisplayRole: rrspAccess.portalDisplayRole,
              shopLoginSlug: rrspAccess.shopLoginSlug ?? null,
              shopLogoUrl: shopBranding?.logoUrl ?? null,
              shopLogoAlt: shopBranding?.companyName || 'Shop logo',
              hasCustomLogo: Boolean(shopBranding?.hasCustomLogo),
              shopDemoMode,
            }
          : null
      }
      clientPlatformLicenses={clientPlatformLicenses}
    >
      {children}
    </PortalShell>
  );
}
