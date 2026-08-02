'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ClipboardList, ShoppingCart } from 'lucide-react';

export function PosSectionNav({ mode }: { mode: 'cd' | 'rrsp' }) {
  const pathname = usePathname() || '';
  const sellHref = mode === 'rrsp' ? '/rrsp/pos' : '/pos';
  const inventoryHref = mode === 'rrsp' ? '/rrsp/pos/inventory' : '/pos/inventory';
  const onInventory = pathname.includes('/pos/inventory');

  const linkClass = (active: boolean) =>
    `inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition ${
      active
        ? 'bg-indigo-600 text-white'
        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
    }`;

  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="POS sections">
      <Link href={sellHref} className={linkClass(!onInventory)}>
        <ShoppingCart className="h-4 w-4" />
        Sell
      </Link>
      <Link href={inventoryHref} className={linkClass(onInventory)}>
        <ClipboardList className="h-4 w-4" />
        Inventory
      </Link>
    </nav>
  );
}
