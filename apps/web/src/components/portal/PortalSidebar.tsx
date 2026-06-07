'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Briefcase,
  Calculator as CalcIcon,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PieChart,
  Pin,
  Receipt,
  Settings,
  Ticket,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { BrandLogo } from '@/components/marketing/BrandLogo';
import { PortalPriceCalculator } from '@/components/portal/PortalPriceCalculator';
import { usePriceCalculatorOpenListener } from '@/contexts/PriceCalculatorContext';

const STORAGE_PINNED = 'cd_sidebar_pinned';
const STORAGE_CALCULATOR = 'cd_sidebar_calculator_open';

function readStoredPinned(): boolean {
  try {
    return localStorage.getItem(STORAGE_PINNED) === '1';
  } catch {
    return false;
  }
}

function readStoredCalculatorOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_CALCULATOR) === '1';
  } catch {
    return false;
  }
}

function sidebarWidthPx(stayExpanded: boolean, calculatorOpen: boolean): number {
  if (!stayExpanded) return 72;
  if (calculatorOpen) return 288;
  return 256;
}

const nav: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
}> = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'technician', 'client'] },
  { href: '/tickets', label: 'Tickets', icon: Ticket, roles: ['admin', 'technician', 'client'] },
  { href: '/billing', label: 'Billing', icon: Receipt, roles: ['client'] },
  { href: '/orders', label: 'Orders', icon: Package, roles: ['admin', 'technician', 'client'] },
  { href: '/clients', label: 'Clients', icon: Users, roles: ['admin', 'technician'] },
  { href: '/msp', label: 'MSP', icon: Briefcase, roles: ['admin', 'technician'] },
  { href: '/accounting', label: 'Accounting', icon: PieChart, roles: ['admin', 'technician'] },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['admin'] },
];

export function PortalSidebar({
  user,
  onWidthChange,
}: {
  user: { firstName: string; lastName: string; role: string; securityClearance: string };
  onWidthChange: (px: number) => void;
}) {
  const visibleNav = nav.filter((item) => item.roles.includes(user.role));
  const pathname = usePathname();
  const router = useRouter();
  const showCalculatorTool = user.role === 'admin' || user.role === 'technician';

  const [pinned, setPinned] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  /** Expanded for this visit only (lost on refresh unless pinned / calculator saved). */
  const [sessionExpanded, setSessionExpanded] = useState(false);
  const [calcPrefill, setCalcPrefill] = useState<{ itemName?: string; usCost?: number }>();
  const [hydrated, setHydrated] = useState(false);

  const stayExpanded = pinned || calculatorOpen || sessionExpanded;
  const effectivelyCollapsed = !stayExpanded;

  const sidebarPx = sidebarWidthPx(stayExpanded, calculatorOpen);

  usePriceCalculatorOpenListener((detail) => {
    setCalculatorOpen(true);
    setSessionExpanded(true);
    setCalcPrefill(detail);
  });

  const onWidthChangeRef = useRef(onWidthChange);
  onWidthChangeRef.current = onWidthChange;

  useLayoutEffect(() => {
    try {
      localStorage.removeItem('cd_sidebar_collapsed');
    } catch {
      /* ignore */
    }
    const pin = readStoredPinned();
    const calc = readStoredCalculatorOpen();
    setPinned(pin);
    setCalculatorOpen(calc);
    setSessionExpanded(false);
    onWidthChangeRef.current(sidebarWidthPx(pin || calc, calc));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    onWidthChangeRef.current(sidebarPx);
  }, [sidebarPx, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_PINNED, pinned ? '1' : '0');
      localStorage.setItem(STORAGE_CALCULATOR, calculatorOpen ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [pinned, calculatorOpen, hydrated]);

  const collapseSidebar = useCallback(() => {
    if (calculatorOpen) return;
    setPinned(false);
    setSessionExpanded(false);
  }, [calculatorOpen]);

  const toggleCollapsed = useCallback(() => {
    if (calculatorOpen) return;
    if (!stayExpanded) {
      setSessionExpanded(true);
    } else {
      collapseSidebar();
    }
  }, [calculatorOpen, stayExpanded, collapseSidebar]);

  const togglePinned = useCallback(() => {
    if (calculatorOpen) return;
    if (pinned) {
      collapseSidebar();
    } else {
      setPinned(true);
      setSessionExpanded(true);
    }
  }, [calculatorOpen, pinned, collapseSidebar]);

  const closeCalculator = useCallback(() => {
    setCalculatorOpen(false);
    setCalcPrefill(undefined);
    if (!pinned) {
      setSessionExpanded(false);
    }
  }, [pinned]);

  const toggleCalculator = useCallback(() => {
    setCalculatorOpen((open) => {
      const next = !open;
      if (next) {
        setSessionExpanded(true);
      } else if (!pinned) {
        setSessionExpanded(false);
      }
      return next;
    });
  }, [pinned]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <aside
      style={{ width: sidebarPx }}
      className={`fixed inset-y-0 left-0 z-[70] flex flex-col bg-cd-950 text-white shadow-2xl ${
        hydrated ? 'transition-[width] duration-200 ease-out' : ''
      }`}
    >
      <div className="border-b border-white/10 px-3 py-4">
        {!effectivelyCollapsed ? (
          <>
            <div className="px-1">
              <BrandLogo href="/dashboard" size="xl" />
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 px-1">
              <p className="truncate text-xs font-medium text-cd-400">MSP Portal</p>
              <div className="flex shrink-0 items-center gap-1">
                {!calculatorOpen && (
                  <button
                    type="button"
                    onClick={togglePinned}
                    title={pinned ? 'Unpin sidebar (collapse on refresh)' : 'Pin sidebar open'}
                    className={`rounded-lg p-2 transition hover:bg-white/10 ${
                      pinned ? 'text-cd-300 ring-1 ring-cd-500/40' : 'text-slate-400 hover:text-white'
                    }`}
                    aria-label={pinned ? 'Unpin sidebar' : 'Pin sidebar open'}
                    aria-pressed={pinned}
                  >
                    <Pin className={`h-4 w-4 ${pinned ? 'fill-current' : ''}`} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  disabled={calculatorOpen}
                  title={
                    calculatorOpen
                      ? 'Close calculator to collapse sidebar'
                      : pinned
                        ? 'Collapse and unpin'
                        : 'Collapse sidebar'
                  }
                  className={`rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white ${
                    calculatorOpen ? 'cursor-not-allowed opacity-40' : ''
                  }`}
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="h-5 w-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={toggleCollapsed}
              disabled={calculatorOpen}
              title={
                calculatorOpen
                  ? 'Close calculator to collapse sidebar'
                  : 'Expand sidebar (temporary until refresh)'
              }
              className={`rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white ${
                calculatorOpen ? 'cursor-not-allowed opacity-40' : ''
              }`}
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {visibleNav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          const displayLabel =
            user.role === 'client' && href === '/tickets'
              ? 'My tickets'
              : user.role === 'client' && href === '/orders'
                ? 'My orders'
                : label;
          return (
            <Link
              key={href}
              href={href}
              title={effectivelyCollapsed ? displayLabel : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-cd-500/20 text-white ring-1 ring-cd-500/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
              } ${effectivelyCollapsed ? 'justify-center px-2' : ''}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!effectivelyCollapsed && (
                <>
                  <span className="truncate">{displayLabel}</span>
                  {active && <ChevronRight className="ml-auto h-4 w-4 shrink-0 opacity-60" />}
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {calculatorOpen && !effectivelyCollapsed && (
        <PortalPriceCalculator
          showAdminFields={user.role === 'admin'}
          onClose={closeCalculator}
          prefill={calcPrefill}
        />
      )}

      <div className="border-t border-white/10 p-3">
        {showCalculatorTool && (
          <button
            type="button"
            onClick={toggleCalculator}
            title="Price calculator"
            className={`mb-3 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
              calculatorOpen
                ? 'bg-cd-500/25 text-white ring-1 ring-cd-500/40'
                : 'text-slate-400 hover:bg-white/5 hover:text-white'
            } ${effectivelyCollapsed ? 'justify-center px-2' : ''}`}
          >
            <CalcIcon className="h-4 w-4 shrink-0" />
            {!effectivelyCollapsed && <span>Calculator</span>}
            {calculatorOpen && !effectivelyCollapsed && (
              <ChevronLeft className="ml-auto h-4 w-4 opacity-70" />
            )}
          </button>
        )}

        {!effectivelyCollapsed ? (
          <div className="mb-3 rounded-xl bg-white/5 px-3 py-2.5">
            <p className="text-sm font-medium">
              {user.firstName} {user.lastName}
            </p>
            <p className="text-xs capitalize text-slate-400">
              {user.role} · {user.securityClearance}
              {pinned && !calculatorOpen && (
                <span className="ml-1 text-cd-400">· pinned</span>
              )}
            </p>
          </div>
        ) : (
          <div
            className="mb-3 flex justify-center"
            title={`${user.firstName} ${user.lastName}`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cd-500/30 text-xs font-bold text-cd-200">
              {user.firstName.charAt(0)}
              {user.lastName.charAt(0)}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={logout}
          title={effectivelyCollapsed ? 'Sign out' : undefined}
          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-white/5 hover:text-white ${
            effectivelyCollapsed ? 'justify-center px-2' : ''
          }`}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!effectivelyCollapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
}
