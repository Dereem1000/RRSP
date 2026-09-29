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
    <div className="flex min-h-0 flex-col gap-3 max-lg:min-h-[calc(100dvh-8rem)] sm:gap-4">
      <div className="shrink-0">
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Shop parts</h1>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          Parts catalog and stock for your shop
        </p>
      </div>
      <Suspense fallback={<PartsLoading />}>
        <PartsCatalogPageClient canManageStock hidePageHeader stockTabLabel="My Stock" />
      </Suspense>
    </div>
  );
}
