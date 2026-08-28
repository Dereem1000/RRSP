'use client';

import { usePathname } from 'next/navigation';
import { RrspShopCustomerActions } from './RrspShopCustomerActions';
import type { PortalRrspAccess } from '@/components/PortalShell';

/** Header quick actions on /rrsp/clients/[id] — shop modules only, never CD routes. */
export function RrspShopCustomerHeaderActions({
  role,
  rrspAccess = null,
}: {
  role: string;
  rrspAccess?: PortalRrspAccess;
}) {
  const pathname = usePathname();
  const clientId = pathname?.match(/^\/rrsp\/clients\/([^/]+)/)?.[1];

  if (role !== 'client' || !clientId || !rrspAccess?.enabled) return null;

  return (
    <RrspShopCustomerActions
      clientId={clientId}
      modules={rrspAccess.modules ?? []}
      size="sm"
    />
  );
}
