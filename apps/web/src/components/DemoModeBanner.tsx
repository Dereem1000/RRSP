'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FlaskConical } from 'lucide-react';

export function DemoModeBanner({
  userRole,
  initialDemoMode = false,
  initialShopDemoMode = false,
  onOpenShopProfile,
}: {
  userRole: string;
  /** Computer Dynamics MSP sandbox (staff only). */
  initialDemoMode?: boolean;
  /** Per-shop RRSP demo sandbox (client / shop users). */
  initialShopDemoMode?: boolean;
  onOpenShopProfile?: () => void;
}) {
  const pathname = usePathname();
  const bannerRef = useRef<HTMLDivElement>(null);
  const [staffDemoMode, setStaffDemoMode] = useState(initialDemoMode);
  const [shopDemoMode, setShopDemoMode] = useState(initialShopDemoMode);

  useEffect(() => {
    setShopDemoMode(initialShopDemoMode);
  }, [initialShopDemoMode]);

  useEffect(() => {
    let cancelled = false;

    function loadStaffDemoMode() {
      if (userRole === 'client') {
        setStaffDemoMode(false);
        return;
      }
      fetch('/api/system/demo-mode', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data.success) return;
          setStaffDemoMode(Boolean(data.demoMode));
        })
        .catch(() => {
          /* keep last known state */
        });
    }

    function loadShopDemoMode() {
      if (userRole !== 'client') return;
      fetch('/api/auth/profile/rrsp', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data.success) return;
          setShopDemoMode(Boolean(data.demoMode));
        })
        .catch(() => {
          /* keep last known state */
        });
    }

    loadStaffDemoMode();
    loadShopDemoMode();
    window.addEventListener('cd-demo-mode-changed', loadStaffDemoMode);
    window.addEventListener('rrsp-shop-demo-changed', loadShopDemoMode);

    return () => {
      cancelled = true;
      window.removeEventListener('cd-demo-mode-changed', loadStaffDemoMode);
      window.removeEventListener('rrsp-shop-demo-changed', loadShopDemoMode);
    };
  }, [pathname, userRole]);

  const showStaff = staffDemoMode && userRole !== 'client';
  const showShop = shopDemoMode && userRole === 'client';
  const visible = showStaff || showShop;

  const syncBannerHeight = useCallback(() => {
    const height =
      visible && bannerRef.current ? Math.ceil(bannerRef.current.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--demo-banner-height', `${height}px`);
  }, [visible]);

  useLayoutEffect(() => {
    if (!visible) {
      document.documentElement.style.setProperty('--demo-banner-height', '0px');
      return;
    }
    syncBannerHeight();
    if (!bannerRef.current) return;
    const observer = new ResizeObserver(syncBannerHeight);
    observer.observe(bannerRef.current);
    return () => observer.disconnect();
  }, [visible, syncBannerHeight]);

  useEffect(() => {
    return () => {
      document.documentElement.style.setProperty('--demo-banner-height', '0px');
    };
  }, []);

  if (!visible) return null;

  const bannerClass =
    'demo-mode-banner fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 px-4 py-2 text-center text-sm font-medium shadow-sm';

  if (showShop) {
    return (
      <div
        ref={bannerRef}
        className={`${bannerClass} border-b border-sky-300 bg-sky-400 text-sky-950`}
      >
        <FlaskConical className="h-4 w-4 shrink-0" />
        <span>
          Shop demo mode — sample data for walkthroughs. Your real shop data is restored when you
          turn this off.
        </span>
        {onOpenShopProfile ? (
          <button
            type="button"
            onClick={onOpenShopProfile}
            className="ml-2 underline underline-offset-2 hover:text-sky-900"
          >
            Business info
          </button>
        ) : (
          <Link href="/dashboard" className="ml-2 underline underline-offset-2 hover:text-sky-900">
            Profile
          </Link>
        )}
      </div>
    );
  }

  return (
    <div
      ref={bannerRef}
      className={`${bannerClass} border-b border-amber-300 bg-amber-400 text-amber-950`}
    >
      <FlaskConical className="h-4 w-4 shrink-0" />
      <span>Demo mode — sandbox active. Changes are temporary and discarded when demo mode is turned off.</span>
      {userRole === 'admin' && (
        <Link href="/settings" className="ml-2 underline underline-offset-2 hover:text-amber-900">
          Settings
        </Link>
      )}
    </div>
  );
}
