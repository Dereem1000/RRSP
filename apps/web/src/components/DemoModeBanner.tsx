'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';

export function DemoModeBanner({
  userRole,
  initialDemoMode = false,
  onVisibleChange,
}: {
  userRole: string;
  initialDemoMode?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}) {
  const pathname = usePathname();
  const [demoMode, setDemoMode] = useState(initialDemoMode);

  useEffect(() => {
    if (userRole === 'client') {
      setDemoMode(false);
      onVisibleChange?.(false);
      return;
    }

    let cancelled = false;

    function loadDemoMode() {
      fetch('/api/system/demo-mode', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => {
          if (cancelled || !data.success) return;
          setDemoMode(Boolean(data.demoMode));
        })
        .catch(() => {
          /* keep last known state */
        });
    }

    loadDemoMode();
    window.addEventListener('cd-demo-mode-changed', loadDemoMode);

    return () => {
      cancelled = true;
      window.removeEventListener('cd-demo-mode-changed', loadDemoMode);
    };
  }, [pathname, userRole, onVisibleChange]);

  useEffect(() => {
    onVisibleChange?.(demoMode && userRole !== 'client');
  }, [demoMode, userRole, onVisibleChange]);

  if (!demoMode || userRole === 'client') return null;

  return (
    <div className="fixed inset-x-0 top-0 z-[80] flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-sm">
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
