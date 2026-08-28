'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { suffix: '', label: 'Overview' },
  { suffix: '/licenses', label: 'Licenses & activation', cdOnly: true },
] as const;

export function ClientDetailNav({
  clientId,
  pathPrefix = '',
  showLicensesTab = true,
}: {
  clientId: string;
  pathPrefix?: string;
  /** CD MSP clients only — hidden for RRSP shop customers */
  showLicensesTab?: boolean;
}) {
  const pathname = usePathname();
  const base = `${pathPrefix}/clients/${clientId}`;
  const visibleTabs = tabs.filter((tab) => tab.cdOnly !== true || showLicensesTab);

  return (
    <nav className="flex gap-1 border-b border-slate-200">
      {visibleTabs.map(({ suffix, label }) => {
        const href = `${base}${suffix}`;
        const active = suffix ? pathname === href : pathname === base;
        return (
          <Link
            key={suffix}
            href={href}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              active
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
