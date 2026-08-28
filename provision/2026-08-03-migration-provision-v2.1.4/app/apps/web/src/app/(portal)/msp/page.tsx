import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { MspDashboardClient } from '@/components/msp/MspDashboardClient';

export default async function MspPage() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/dashboard');

  return <MspDashboardClient />;
}
