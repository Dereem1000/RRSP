import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { ManagementSystemsClient } from '@/components/msp/ManagementSystemsClient';

export default async function ManagementSystemsPage() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/dashboard');

  return <ManagementSystemsClient />;
}
