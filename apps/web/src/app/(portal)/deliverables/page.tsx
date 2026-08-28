import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { clientHasPlatformLicenses } from '@/lib/client-platform-deliverables';
import { DeliverablesClient } from '@/components/deliverables/DeliverablesClient';

function DeliverablesLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading web platform deliverables…
    </div>
  );
}

export default async function DeliverablesPage() {
  const { user } = await requirePortalUser();
  if (user.role !== 'client') redirect('/dashboard');
  if (!(await clientHasPlatformLicenses(user.id))) redirect('/dashboard');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Web Platform Deliverables</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review signed-off scope, acceptance documentation, and your software operating license for
          licensed web platforms.
        </p>
      </div>
      <Suspense fallback={<DeliverablesLoading />}>
        <DeliverablesClient />
      </Suspense>
    </div>
  );
}
