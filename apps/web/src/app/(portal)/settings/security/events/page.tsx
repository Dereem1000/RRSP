import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { SecurityEventsPageClient } from '@/components/security/SecurityEventsPageClient';

function EventsLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading security events…
    </div>
  );
}

export default async function SecurityEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ ip?: string }>;
}) {
  const { user } = await requirePortalUser();
  if (user.role !== 'admin') redirect('/dashboard');

  const params = await searchParams;
  const initialIp = typeof params.ip === 'string' ? params.ip.trim() : '';

  return (
    <Suspense fallback={<EventsLoading />}>
      <SecurityEventsPageClient initialIp={initialIp} />
    </Suspense>
  );
}
