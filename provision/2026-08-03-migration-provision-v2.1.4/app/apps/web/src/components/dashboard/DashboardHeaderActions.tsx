import Link from 'next/link';
import { FileText, Package, Receipt, Ticket } from 'lucide-react';

const staffActions = [
  { href: '/tickets?create=1', label: 'New ticket', icon: Ticket },
  { href: '/orders?create=1', label: 'New order', icon: Package },
] as const;

const adminActions = [
  { href: '/accounting?create=invoice', label: 'New invoice', icon: Receipt },
  { href: '/accounting?create=quote', label: 'New quote', icon: FileText },
] as const;

export function DashboardHeaderActions({ role }: { role: string }) {
  if (role !== 'admin' && role !== 'technician') return null;

  const actions = role === 'admin' ? [...staffActions, ...adminActions] : staffActions;

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {actions.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Icon className="h-3.5 w-3.5 text-indigo-600" />
          {label}
        </Link>
      ))}
    </div>
  );
}
