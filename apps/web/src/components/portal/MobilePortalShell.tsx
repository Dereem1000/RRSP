'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { LayoutGrid, LogOut, Pencil, Settings, X } from 'lucide-react';
import { BrandLogo } from '@/components/marketing/BrandLogo';
import { DashboardHeaderActions } from '@/components/dashboard/DashboardHeaderActions';
import { TicketHeaderActions } from '@/components/tickets/TicketHeaderActions';
import { ClientHeaderActions } from '@/components/clients/ClientHeaderActions';
import { RrspShopCustomerHeaderActions } from '@/components/clients/RrspShopCustomerHeaderActions';
import { AccountingHeaderActions } from '@/components/accounting/AccountingHeaderActions';
import { PortalQuickCreate } from '@/components/portal/PortalQuickCreate';
import {
  getMobilePrimaryNav,
  getPortalNavForRole,
  getPortalNavLabel,
  getPortalPageLabel,
  type PortalNavItem,
} from '@/lib/portal-nav';
import { usePriceCalculatorOpenListener } from '@/contexts/PriceCalculatorContext';
import { shopStaffLoginPath } from '@/lib/rrsp-shop-staff';

export function MobilePortalChrome({
  user,
  miniDockActive = false,
  rrspAccess = null,
  clientPlatformLicenses = false,
  partsIncomingBadge = 0,
  onOpenProfile,
  onEditLogo,
  shopLogoUrl = null,
  shopLogoAlt,
}: {
  user: { id: number; firstName: string; lastName: string; role: string; securityClearance: string };
  miniDockActive?: boolean;
  rrspAccess?: {
    featureEnabled?: boolean;
    enabled: boolean;
    modules: string[];
    isShopOwner?: boolean;
    isShopStaff?: boolean;
    portalDisplayRole?: string;
    shopLoginSlug?: string | null;
  } | null;
  clientPlatformLicenses?: boolean;
  partsIncomingBadge?: number;
  onOpenProfile?: () => void;
  onEditLogo?: () => void;
  shopLogoUrl?: string | null;
  shopLogoAlt?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const allNav = useMemo(
    () =>
      getPortalNavForRole(user.role, {
        miniDockActive,
        rrsp: rrspAccess,
        clientPlatformLicenses,
      }),
    [user.role, miniDockActive, rrspAccess, clientPlatformLicenses],
  );
  const portalHomeHref =
    rrspAccess?.isShopStaff && rrspAccess?.enabled ? '/rrsp' : '/dashboard';
  const primaryNav = useMemo(
    () =>
      getMobilePrimaryNav(user.role, {
        miniDockActive,
        rrsp: rrspAccess,
        clientPlatformLicenses,
      }),
    [user.role, miniDockActive, rrspAccess, clientPlatformLicenses],
  );
  const primaryHrefs = useMemo(() => new Set(primaryNav.map((item) => item.href)), [primaryNav]);
  const moreNav = useMemo(
    () => allNav.filter((item) => !primaryHrefs.has(item.href)),
    [allNav, primaryHrefs],
  );

  const pageLabel = getPortalPageLabel(pathname, user.role);

  usePriceCalculatorOpenListener(() => {
    setMoreOpen(true);
  });

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push(shopStaffLoginPath(rrspAccess?.isShopStaff ? rrspAccess.shopLoginSlug : null));
    router.refresh();
  }, [router, rrspAccess?.isShopStaff, rrspAccess?.shopLoginSlug]);

  const isMoreActive = moreNav.some(
    (item) => pathname === item.href || (item.href !== '/' && pathname?.startsWith(`${item.href}/`)),
  );

  return (
    <>
      <header
        className="portal-mobile-chrome sticky z-30 border-b border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur-md sm:px-4 sm:py-3"
        style={{ top: 'var(--demo-banner-height, 0px)' }}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="cd-mobile-header-brand relative inline-flex">
              <BrandLogo
                href={portalHomeHref}
                size="sm"
                src={shopLogoUrl}
                alt={shopLogoAlt || 'Portal logo'}
                usePlatformFallback={!rrspAccess?.isShopStaff}
              />
              {onEditLogo ? (
                <button
                  type="button"
                  onClick={onEditLogo}
                  className="absolute -right-2 -top-1 rounded-full border border-slate-200 bg-white p-1 text-slate-600 shadow-sm hover:bg-slate-50"
                  aria-label="Edit business logo"
                  title="Edit business logo"
                >
                  <Pencil className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            <p className="truncate text-base font-semibold text-slate-900 sm:text-lg">{pageLabel}</p>
          </div>
          <div className="cd-mobile-header-actions items-center">
            <PortalQuickCreate user={user} rrspAccess={rrspAccess} />
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

      <nav
        className="portal-mobile-chrome cd-mobile-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 backdrop-blur-md"
        aria-label="Main navigation"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1">
          {primaryNav.map((item) => (
            <MobileTabLink
              key={item.href}
              item={item}
              role={user.role}
              active={
                pathname === item.href ||
                (item.href !== '/' && Boolean(pathname?.startsWith(`${item.href}/`)))
              }
            />
          ))}
          {moreNav.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              className={`cd-mobile-tab-link flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-2 text-[10px] font-medium transition sm:px-1 ${
                isMoreActive || moreOpen
                  ? 'text-cd-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              aria-expanded={moreOpen}
              aria-label="More navigation"
            >
              <LayoutGrid className="h-5 w-5 shrink-0" aria-hidden />
              <span className="cd-mobile-tab-label truncate">More</span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div className="portal-mobile-chrome fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/40 backdrop-blur-[2px]">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className="relative max-h-[min(78dvh,520px)] overflow-hidden rounded-t-3xl bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="More options"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onOpenProfile?.();
                }}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left transition hover:bg-slate-50"
                title="Profile & settings"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-semibold text-slate-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-xs capitalize text-slate-500">
                    {rrspAccess?.portalDisplayRole ?? user.role}
                    {(user.role === 'admin' || user.role === 'technician') &&
                      !rrspAccess?.isShopOwner &&
                      !rrspAccess?.isShopStaff && (
                        <>
                          {' '}
                          · {user.securityClearance}
                        </>
                      )}
                    {' '}
                    · profile & settings
                  </p>
                </div>
                <Settings className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[min(58dvh,420px)] overflow-y-auto p-3">
              <div className="grid grid-cols-2 gap-2">
                {moreNav.map((item) => (
                  <div key={item.href} className="contents">
                    {item.section ? (
                      <p className="col-span-2 mt-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0">
                        {item.section}
                      </p>
                    ) : null}
                    <Link
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium transition ${
                        pathname === item.href
                          ? 'border-cd-500/30 bg-cd-500/10 text-cd-800'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{getPortalNavLabel(item.href, user.role)}</span>
                      {partsIncomingBadge > 0 &&
                        (item.href === '/parts' || item.href === '/rrsp/parts') && (
                          <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-900">
                            {partsIncomingBadge > 99 ? '99+' : partsIncomingBadge}
                          </span>
                        )}
                    </Link>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={logout}
                className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MobileTabLink({
  item,
  role,
  active,
}: {
  item: PortalNavItem;
  role: string;
  active: boolean;
}) {
  const Icon = item.icon;
  const label = getPortalNavLabel(item.href, role);

  return (
    <Link
      href={item.href}
      className={`cd-mobile-tab-link flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-0.5 py-2 text-[10px] font-medium transition sm:px-1 ${
        active ? 'text-cd-700' : 'text-slate-500 hover:text-slate-800'
      }`}
      aria-current={active ? 'page' : undefined}
      title={label}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden />
      <span className="cd-mobile-tab-label max-w-full truncate">{label}</span>
    </Link>
  );
}
