import Link from 'next/link';
import { FileText, Package, Receipt, Ticket } from 'lucide-react';
import type { RrspModule } from '@/lib/rrsp';

const btnClassMd =
  'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800';

const btnClassSm =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700';

type Props = {
  clientId: string;
  modules: string[];
  size?: 'sm' | 'md';
};

/** Quick-create links for a shop customer — RRSP routes only, gated by enabled shop modules. */
export function RrspShopCustomerActions({ clientId, modules, size = 'md' }: Props) {
  const enabled = new Set(modules);
  const btnClass = size === 'sm' ? btnClassSm : btnClassMd;
  const iconClass = size === 'sm' ? 'h-3.5 w-3.5 text-indigo-600' : 'h-4 w-4';
  const base = '/rrsp';

  const actions: Array<{ key: string; href: string; label: string; icon: typeof Ticket }> = [];

  if (enabled.has('tickets' satisfies RrspModule)) {
    actions.push({
      key: 'ticket',
      href: `${base}/tickets?create=1&clientId=${clientId}`,
      label: 'Shop ticket',
      icon: Ticket,
    });
  }
  if (enabled.has('orders' satisfies RrspModule)) {
    actions.push({
      key: 'order',
      href: `${base}/orders?create=1&clientId=${clientId}`,
      label: 'Shop order',
      icon: Package,
    });
  }
  if (enabled.has('accounting' satisfies RrspModule)) {
    actions.push(
      {
        key: 'invoice',
        href: `${base}/accounting?create=invoice&clientId=${clientId}`,
        label: 'Shop invoice',
        icon: Receipt,
      },
      {
        key: 'quote',
        href: `${base}/accounting?create=quote&clientId=${clientId}`,
        label: 'Shop quote',
        icon: FileText,
      },
    );
  }

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions.map(({ key, href, label, icon: Icon }) => (
        <Link key={key} href={href} className={btnClass}>
          <Icon className={iconClass} />
          {label}
        </Link>
      ))}
    </div>
  );
}
