import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { ClientBillingPageClient } from '@/components/billing/ClientBillingPageClient';

function BillingLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading billing…
    </div>
  );
}

export default async function BillingPage() {
  const { user } = await requirePortalUser();
  if (user.role !== 'client') redirect('/accounting');

  return (
    <Suspense fallback={<BillingLoading />}>
      <ClientBillingPageClient />
    </Suspense>
  );
}
