import Link from 'next/link';
import { FileText, Package, Receipt, Ticket } from 'lucide-react';

export function ClientQuickActions({
  clientId,
  userRole,
  size = 'md',
}: {
  clientId: string;
  userRole: string;
  size?: 'sm' | 'md';
}) {
  const isStaff = userRole === 'admin' || userRole === 'technician';
  const isAdmin = userRole === 'admin';
  if (!isStaff) return null;

  const btnClass =
    size === 'sm'
      ? 'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700'
      : 'inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-800';

  const iconClass = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={`/tickets?create=1&clientId=${clientId}`}
        className={btnClass}
        title="New ticket"
        aria-label="New ticket for this client"
      >
        <Ticket className={iconClass} />
        {size === 'md' ? 'New ticket' : null}
      </Link>
      <Link
        href={`/orders?create=1&clientId=${clientId}`}
        className={btnClass}
        title="New order"
        aria-label="New order for this client"
      >
        <Package className={iconClass} />
        {size === 'md' ? 'New order' : null}
      </Link>
      {isAdmin && (
        <>
          <Link
            href={`/accounting?create=invoice&clientId=${clientId}`}
            className={btnClass}
            title="New invoice"
            aria-label="New invoice for this client"
          >
            <Receipt className={iconClass} />
            {size === 'md' ? 'New invoice' : null}
          </Link>
          <Link
            href={`/accounting?create=quote&clientId=${clientId}`}
            className={btnClass}
            title="New quote"
            aria-label="New quote for this client"
          >
            <FileText className={iconClass} />
            {size === 'md' ? 'New quote' : null}
          </Link>
        </>
      )}
    </div>
  );
}
