import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { DeveloperToolboxPageClient } from '@/components/developer-toolbox/DeveloperToolboxPageClient';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const PROVISION_UI_REV = 'async-v4';

export default async function DeveloperToolboxPage() {
  const { user } = await requirePortalUser();
  if (user.role !== 'admin') redirect('/dashboard');

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-20 text-slate-500">Loading Developer Toolbox…</div>
      }
    >
      <p className="mb-2 text-xs text-slate-400">Provisioning UI build: {PROVISION_UI_REV}</p>
      <DeveloperToolboxPageClient />
    </Suspense>
  );
}
