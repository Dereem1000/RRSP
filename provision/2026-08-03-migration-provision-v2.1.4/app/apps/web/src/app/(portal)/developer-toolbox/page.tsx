import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { DeveloperToolboxPageClient } from '@/components/developer-toolbox/DeveloperToolboxPageClient';

export default async function DeveloperToolboxPage() {
  const { user } = await requirePortalUser();
  if (user.role !== 'admin') redirect('/dashboard');

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-slate-500">Loading Developer Toolbox…</div>
      }
    >
      <DeveloperToolboxPageClient />
    </Suspense>
  );
}
