import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { ClientBillingPageClient } from '@/components/billing/ClientBillingPageClient';

export default async function BillingPage() {
  const { user } = await requirePortalUser();
  if (user.role !== 'client') redirect('/accounting');
  return <ClientBillingPageClient />;
}
