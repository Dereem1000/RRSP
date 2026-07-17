'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { DashboardHeaderActions } from '@/components/dashboard/DashboardHeaderActions';
import { TicketHeaderActions } from '@/components/tickets/TicketHeaderActions';
import { ClientHeaderActions } from '@/components/clients/ClientHeaderActions';
import { AccountingHeaderActions } from '@/components/accounting/AccountingHeaderActions';
import { MiniAssistantDock } from '@/components/mini/MiniAssistantDock';
import { SecurityStatusBadge } from '@/components/security/SecurityStatusBadge';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { MobilePortalChrome } from '@/components/portal/MobilePortalShell';
import { PriceCalculatorProvider } from '@/contexts/PriceCalculatorContext';
import { getPortalPageLabel } from '@/lib/portal-nav';
import { useAdaptiveMiniPoll } from '@/lib/use-adaptive-mini-poll';

export function PortalShell({
  children,
  user,
  demoMode = false,
}: {
  children: React.ReactNode;
  user: { id: number; firstName: string; lastName: string; role: string; securityClearance: string };
  demoMode?: boolean;
}) {
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = useState(72);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [demoBannerVisible, setDemoBannerVisible] = useState(demoMode);
  const [miniDockActive, setMiniDockActive] = useState(false);

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

  const handleSidebarWidthChange = useCallback((px: number) => {
    setSidebarWidth(px);
    setSidebarReady(true);
  }, []);

  const handleDemoBannerVisible = useCallback((visible: boolean) => {
    setDemoBannerVisible(visible);
  }, []);

  const pageLabel = getPortalPageLabel(pathname, user.role);

  return (
    <PriceCalculatorProvider>
      <DemoModeBanner
        userRole={user.role}
        initialDemoMode={demoMode}
        onVisibleChange={handleDemoBannerVisible}
      />

      <div
        className="cd-mobile-app min-h-dvh bg-slate-100 lg:min-h-screen"
        style={{
          paddingTop: demoBannerVisible ? 40 : 0,
          ['--portal-sidebar-width' as string]: `${sidebarWidth}px`,
        }}
      >
        <div className="hidden lg:contents">
          <PortalSidebar user={user} onWidthChange={handleSidebarWidthChange} miniDockActive={miniDockActive} />
        </div>

        <div
          className={`flex min-h-dvh flex-col pl-0 lg:pl-[var(--portal-sidebar-width)] lg:min-h-screen ${sidebarReady ? 'transition-[padding-left] duration-200 ease-out' : ''}`}
        >
          <MobilePortalChrome user={user} miniDockActive={miniDockActive} />

          <header className="portal-desktop-header sticky top-0 z-20 items-center justify-between gap-4 border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-md lg:flex">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{pageLabel}</p>
            {pathname === '/dashboard' && <DashboardHeaderActions role={user.role} />}
            {pathname?.match(/^\/tickets\/[^/]+$/) && <TicketHeaderActions role={user.role} />}
            {pathname?.match(/^\/clients\/[^/]+/) && <ClientHeaderActions role={user.role} />}
            {pathname === '/accounting' && <AccountingHeaderActions role={user.role} />}
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
    </PriceCalculatorProvider>
  );
}
