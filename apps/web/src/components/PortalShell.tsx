'use client';

import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DemoModeBanner } from '@/components/DemoModeBanner';
import { DashboardHeaderActions } from '@/components/dashboard/DashboardHeaderActions';
import { SecurityStatusBadge } from '@/components/security/SecurityStatusBadge';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { PriceCalculatorProvider } from '@/contexts/PriceCalculatorContext';

const navLabels: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tickets': 'Tickets',
  '/billing': 'Billing',
  '/orders': 'Orders',
  '/clients': 'Clients',
  '/msp': 'MSP',
  '/accounting': 'Accounting',
  '/settings': 'Settings',
};

export function PortalShell({
  children,
  user,
  demoMode = false,
}: {
  children: React.ReactNode;
  user: { firstName: string; lastName: string; role: string; securityClearance: string };
  demoMode?: boolean;
}) {
  const pathname = usePathname();
  const [sidebarWidth, setSidebarWidth] = useState(72);
  const [sidebarReady, setSidebarReady] = useState(false);
  const [demoBannerVisible, setDemoBannerVisible] = useState(demoMode);

  const handleSidebarWidthChange = useCallback((px: number) => {
    setSidebarWidth(px);
    setSidebarReady(true);
  }, []);

  const handleDemoBannerVisible = useCallback((visible: boolean) => {
    setDemoBannerVisible(visible);
  }, []);

  return (
    <PriceCalculatorProvider>
      <DemoModeBanner
        userRole={user.role}
        initialDemoMode={demoMode}
        onVisibleChange={handleDemoBannerVisible}
      />
      <div className="flex min-h-screen bg-slate-100">
        <PortalSidebar user={user} onWidthChange={handleSidebarWidthChange} />

        <div
          className={`flex flex-1 flex-col ${sidebarReady ? 'transition-[padding-left] duration-200 ease-out' : ''}`}
          style={{
            paddingLeft: sidebarWidth,
            paddingTop: demoBannerVisible ? 40 : 0,
          }}
        >
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/80 px-8 py-4 backdrop-blur-md">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
              {navLabels[pathname] ?? 'Portal'}
            </p>
            {pathname === '/dashboard' && <DashboardHeaderActions role={user.role} />}
          </header>
          <main className="flex-1 p-8">{children}</main>
          {user.role === 'admin' && <SecurityStatusBadge />}
        </div>
      </div>
    </PriceCalculatorProvider>
  );
}
