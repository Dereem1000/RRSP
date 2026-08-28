import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { PartsCatalogPageClient } from '@/components/parts/PartsCatalogPageClient';

function PartsLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading parts catalog…
    </div>
  );
}

/** Shop parts still uses the shared CD parts catalog. */
export default async function RrspPartsPage() {
  const { user } = await requirePortalUser();
  await requireRrspModule(user, 'parts');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shop parts</h1>
        <p className="mt-1 text-sm text-slate-500">Parts catalog and stock for your shop</p>
      </div>
      <Suspense fallback={<PartsLoading />}>
        <PartsCatalogPageClient canManageStock stockTabLabel="My Stock" />
      </Suspense>
    </div>
  );
}
