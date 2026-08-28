import Link from 'next/link';
import type { ReactNode } from 'react';

const docLinkClass = 'font-medium text-indigo-600 hover:text-indigo-800 hover:underline';
const monoLinkClass = 'font-mono text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline';

type LinkProps = {
  id?: string | null;
  label: ReactNode;
  className?: string;
  /** e.g. `/rrsp` to keep navigation inside shop portal */
  pathPrefix?: string;
};

export function TicketLink({ id, label, className, pathPrefix = '' }: LinkProps) {
  if (!id) return <span className={className}>{label}</span>;
  return (
    <Link href={`${pathPrefix}/tickets/${id}`} className={className ?? monoLinkClass}>
      {label}
    </Link>
  );
}

export function ClientLink({ id, label, className, pathPrefix = '' }: LinkProps) {
  if (!id) return <span className={className}>{label}</span>;
  return (
    <Link href={`${pathPrefix}/clients/${id}`} className={className ?? docLinkClass}>
      {label}
    </Link>
  );
}

export function InvoiceLink({
  id,
  label,
  className,
  portal = 'staff',
  pathPrefix = '',
}: LinkProps & { portal?: 'staff' | 'client' }) {
  if (!id) return <span className={className}>{label}</span>;
  const href =
    portal === 'client'
      ? `/billing?invoice=${id}`
      : `${pathPrefix}/accounting?invoice=${id}`;
  return (
    <Link href={href} className={className ?? monoLinkClass}>
      {label}
    </Link>
  );
}

export function QuoteLink({
  id,
  label,
  className,
  portal = 'staff',
  pathPrefix = '',
}: LinkProps & { portal?: 'staff' | 'client' }) {
  if (!id) return <span className={className}>{label}</span>;
  const href =
    portal === 'client'
      ? `/billing?quote=${id}`
      : `${pathPrefix}/accounting?quote=${id}`;
  return (
    <Link href={href} className={className ?? monoLinkClass}>
      {label}
    </Link>
  );
}

export function OrderLink({ id, label, className }: LinkProps) {
  if (!id) return <span className={className}>{label}</span>;
  return (
    <Link href={`/orders?order=${id}`} className={className ?? monoLinkClass}>
      {label}
    </Link>
  );
}

export function LinkedDocumentLink({
  type,
  id,
  label,
  className,
}: {
  type: 'ticket' | 'invoice' | 'order' | 'quote' | 'credit_note';
  id?: string | null;
  label: ReactNode;
  className?: string;
}) {
  if (type === 'credit_note') {
    return <span className={className ?? monoLinkClass}>{label}</span>;
  }
  if (type === 'ticket') return <TicketLink id={id} label={label} className={className} />;
  if (type === 'invoice') return <InvoiceLink id={id} label={label} className={className} />;
  if (type === 'quote') return <QuoteLink id={id} label={label} className={className} />;
  return <OrderLink id={id} label={label} className={className} />;
}
