'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { DashboardHeaderActions } from '@/components/dashboard/DashboardHeaderActions';
import { TicketHeaderActions } from '@/components/tickets/TicketHeaderActions';
import { ClientHeaderActions } from '@/components/clients/ClientHeaderActions';
import { RrspShopCustomerHeaderActions } from '@/components/clients/RrspShopCustomerHeaderActions';
import { AccountingHeaderActions } from '@/components/accounting/AccountingHeaderActions';
import { MiniAssistantDock } from '@/components/mini/MiniAssistantDock';
import { SecurityStatusBadge } from '@/components/security/SecurityStatusBadge';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { MobilePortalChrome } from '@/components/portal/MobilePortalShell';
import {
  AccountProfileModal,
  type ProfileTab,
} from '@/components/portal/AccountProfileModal';
import { ComputerDynamicsCreditBadge } from '@/components/marketing/BrandLogo';
import { PartsLiveSync } from '@/components/parts/PartsLiveSync';
import { PortalQuickCreate } from '@/components/portal/PortalQuickCreate';
import { PriceCalculatorProvider } from '@/contexts/PriceCalculatorContext';
import { getPortalPageLabel } from '@/lib/portal-nav';
import { useAdaptiveMiniPoll } from '@/lib/use-adaptive-mini-poll';

export type PortalRrspAccess = {
  featureEnabled?: boolean;
  enabled: boolean;
  modules: string[];
  needsContact?: boolean;
  licenseActive?: boolean;
  shopLogoUrl?: string | null;
  shopLogoAlt?: string;
  hasCustomLogo?: boolean;
  shopDemoMode?: boolean;
  isShopOwner?: boolean;
  isShopStaff?: boolean;
  portalDisplayRole?: string;
} | null;

export function PortalShell({
  children,
  user,
  demoMode = false,
  rrspAccess = null,
  clientPlatformLicenses = false,
  partsIncomingBadge = 0,
}: {
  children: React.ReactNode;
  user: { id: number; firstName: string; lastName: string; role: string; securityClearance: string };
  demoMode?: boolean;
  rrspAccess?: PortalRrspAccess;
  clientPlatformLicenses?: boolean;
  partsIncomingBadge?: number;
}) {
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = useState(72);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [miniDockActive, setMiniDockActive] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileMode, setProfileMode] = useState<'profile' | 'contact'>('profile');
  const [profileTab, setProfileTab] = useState<ProfileTab>('account');
  const [contactPromptDismissed, setContactPromptDismissed] = useState(false);
  const [shopLogoUrl, setShopLogoUrl] = useState<string | null>(rrspAccess?.shopLogoUrl ?? null);
  const [hasCustomLogo, setHasCustomLogo] = useState(Boolean(rrspAccess?.hasCustomLogo));
  const [shopLogoAlt, setShopLogoAlt] = useState(rrspAccess?.shopLogoAlt || 'Shop logo');

  const canEditShopLogo = Boolean(
    user.role === 'client' &&
      !rrspAccess?.isShopStaff &&
      rrspAccess?.featureEnabled &&
      (rrspAccess.licenseActive || rrspAccess.enabled || rrspAccess.needsContact)
  );

  useEffect(() => {
    setShopLogoUrl(rrspAccess?.shopLogoUrl ?? null);
    setHasCustomLogo(Boolean(rrspAccess?.hasCustomLogo));
    setShopLogoAlt(rrspAccess?.shopLogoAlt || 'Shop logo');
  }, [rrspAccess?.shopLogoUrl, rrspAccess?.hasCustomLogo, rrspAccess?.shopLogoAlt]);

  const refreshMiniStatus = useCallback(async (): Promise<boolean> => {
    if (user.role !== 'admin') return true;
    try {
      const res = await fetch('/api/mini/status', { cache: 'no-store' });
      if (res.status === 502 || res.status === 504 || res.status === 524) return false;
      if (!res.ok) return false;
      const data = await res.json();
      setMiniDockActive(Boolean(data.online));
      return true;
    } catch {
      setMiniDockActive(false);
      return false;
    }
  }, [user.role]);

  useAdaptiveMiniPoll(user.role === 'admin', refreshMiniStatus, { baseMs: 60_000, maxMs: 180_000 });

  useEffect(() => {
    if (rrspAccess?.needsContact && !contactPromptDismissed && !profileOpen) {
      setProfileMode('contact');
      setProfileTab('account');
      setProfileOpen(true);
    }
  }, [rrspAccess?.needsContact, contactPromptDismissed, profileOpen]);

  const handleSidebarWidthChange = useCallback((px: number) => {
    setSidebarWidth(px);
    setSidebarReady(true);
  }, []);

  const openProfile = useCallback((tab: ProfileTab = 'account') => {
    setProfileMode('profile');
    setProfileTab(tab);
    setProfileOpen(true);
  }, []);

  const closeProfile = useCallback(() => {
    if (profileMode === 'contact') {
      setContactPromptDismissed(true);
    }
    setProfileOpen(false);
  }, [profileMode]);

  const refreshShopBranding = useCallback(async () => {
    if (!canEditShopLogo) return;
    try {
      const res = await fetch('/api/auth/profile/rrsp', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) return;
      const logo = String(data.branding?.companyLogo ?? '').trim();
      const custom =
        Boolean(logo) &&
        logo !== '/logo.svg' &&
        logo !== '/logo.png' &&
        logo !== '/images/logo.png';
      setShopLogoUrl(custom ? logo : null);
      setHasCustomLogo(custom);
      setShopLogoAlt(data.branding?.companyName || 'Shop logo');
    } catch {
      // Keep previous branding.
    }
  }, [canEditShopLogo]);

  const pageLabel = getPortalPageLabel(pathname, user.role);
  const isPosRoute =
    pathname === '/pos' ||
    pathname === '/rrsp/pos' ||
    pathname?.startsWith('/pos/') === true ||
    pathname?.startsWith('/rrsp/pos/') === true;

  const creditBadgeOffset = miniDockActive ? 'bottom-24 lg:bottom-4' : 'bottom-20 lg:bottom-4';
  const creditBadgeClassName = isPosRoute
    ? `left-3 right-auto sm:left-4 lg:left-[calc(var(--portal-sidebar-width)+1rem)] ${creditBadgeOffset}`
    : `${creditBadgeOffset} right-3 sm:right-4`;

  return (
    <PriceCalculatorProvider>
      <div
        className="contents"
        style={{ ['--portal-sidebar-width' as string]: `${sidebarWidth}px` }}
      >
      <DemoModeBanner
        userRole={user.role}
        initialDemoMode={demoMode}
        initialShopDemoMode={Boolean(rrspAccess?.shopDemoMode)}
        onOpenShopProfile={() => openProfile('business')}
      />

      <div
        className="cd-mobile-app min-h-dvh bg-slate-100 lg:min-h-screen"
        style={{
          paddingTop: 'var(--demo-banner-height, 0px)',
          ['--portal-sidebar-width' as string]: `${sidebarWidth}px`,
        }}
      >
        <div className="hidden lg:contents">
          <PortalSidebar
            user={user}
            onWidthChange={handleSidebarWidthChange}
            miniDockActive={miniDockActive}
            rrspAccess={rrspAccess}
            clientPlatformLicenses={clientPlatformLicenses}
            partsIncomingBadge={partsIncomingBadge}
            onOpenProfile={() => openProfile('account')}
            onEditLogo={canEditShopLogo ? () => openProfile('business') : undefined}
            shopLogoUrl={shopLogoUrl}
            shopLogoAlt={shopLogoAlt}
          />
        </div>

        <div
          className={`flex min-h-dvh flex-col pl-0 lg:pl-[var(--portal-sidebar-width)] lg:min-h-screen ${sidebarReady ? 'transition-[padding-left] duration-200 ease-out' : ''}`}
        >
          <MobilePortalChrome
            user={user}
            miniDockActive={miniDockActive}
            rrspAccess={rrspAccess}
            clientPlatformLicenses={clientPlatformLicenses}
            partsIncomingBadge={partsIncomingBadge}
            onOpenProfile={() => openProfile('account')}
            onEditLogo={canEditShopLogo ? () => openProfile('business') : undefined}
            shopLogoUrl={shopLogoUrl}
            shopLogoAlt={shopLogoAlt}
          />

          <header
            className="portal-desktop-header sticky z-20 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-md lg:flex"
            style={{ top: 'var(--demo-banner-height, 0px)' }}
          >
            <div className="flex w-full min-w-0 items-center justify-between gap-4">
              <p className="truncate text-xs font-medium uppercase tracking-wider text-slate-400">
                {pageLabel}
              </p>
              <div className="flex shrink-0 items-center gap-3">
                {!rrspAccess?.isShopStaff && (
                  <PortalQuickCreate user={user} rrspAccess={rrspAccess} />
                )}
                {pathname === '/dashboard' && <DashboardHeaderActions role={user.role} />}
                {pathname?.match(/^\/tickets\/[^/]+$/) && <TicketHeaderActions role={user.role} />}
                {pathname?.match(/^\/clients\/[^/]+$/) && <ClientHeaderActions role={user.role} />}
                {pathname?.match(/^\/rrsp\/clients\/[^/]+$/) && (
                  <RrspShopCustomerHeaderActions role={user.role} rrspAccess={rrspAccess} />
                )}
                {(pathname === '/accounting' || pathname === '/rrsp/accounting') && (
                  <AccountingHeaderActions role={user.role} rrspAccess={rrspAccess} />
                )}
              </div>
            </div>
          </header>

          <main
            className={`cd-mobile-main flex-1 overflow-x-hidden px-3 py-3 sm:px-4 sm:py-4 lg:overflow-x-visible lg:p-8${miniDockActive ? ' cd-mobile-main--mini-dock' : ''}`}
          >
            {children}
          </main>

          {user.role === 'admin' && <SecurityStatusBadge />}

          {user.role === 'admin' && (
            <div className="portal-desktop-only hidden lg:contents">
              <MiniAssistantDock
                enabled={miniDockActive && pathname !== '/mini'}
                sidebarWidth={sidebarWidth}
                page={pathname || '/dashboard'}
                pageLabel={pageLabel}
                userId={user.id}
                userRole={user.role}
                userName={`${user.firstName} ${user.lastName}`.trim()}
              />
            </div>
          )}
        </div>
      </div>

      <ComputerDynamicsCreditBadge visible={hasCustomLogo} className={creditBadgeClassName} />

      <AccountProfileModal
        open={profileOpen}
        onClose={closeProfile}
        mode={profileMode}
        forceContact={profileMode === 'contact'}
        initialTab={profileTab}
        onBrandingSaved={refreshShopBranding}
      />

      {(user.role === 'admin' || user.role === 'technician' || user.role === 'client') && (
        <PartsLiveSync role={user.role} isAdmin={user.role === 'admin'} />
      )}
      </div>
    </PriceCalculatorProvider>
  );
}
