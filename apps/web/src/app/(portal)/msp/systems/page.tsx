import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { ManagementSystemsClient } from '@/components/msp/ManagementSystemsClient';

export default async function ManagementSystemsPage() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/dashboard');

  return (
    <Suspense fallback={<div className="py-20 text-center text-slate-500">Loading management systems…</div>}>
      <ManagementSystemsClient />
    </Suspense>
  );
}
