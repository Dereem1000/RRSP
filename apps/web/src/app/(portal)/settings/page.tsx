import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { redirect } from 'next/navigation';
import { SettingsPageClient } from '@/components/settings/SettingsPageClient';

function SettingsLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading settings…
    </div>
  );
}

export default async function SettingsPage() {
  const { user } = await requirePortalUser();
  if (user.role !== 'admin') redirect('/dashboard');

  return (
    <Suspense fallback={<SettingsLoading />}>
      <SettingsPageClient />
    </Suspense>
  );
}
