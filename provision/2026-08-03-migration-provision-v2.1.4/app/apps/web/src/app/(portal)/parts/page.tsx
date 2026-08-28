import { Suspense } from 'react';
import { PartsCatalogPageClient } from '@/components/parts/PartsCatalogPageClient';
import { requirePortalUser } from '@/lib/session';

function PartsLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading parts catalog…
    </div>
  );
}

/** Legacy CD parts catalog (shared CD database). */
export default async function PartsCatalogPage() {
  const { user } = await requirePortalUser();
  const stockTabLabel = user.role === 'client' ? 'My Stock' : 'Our Stock';

  return (
    <Suspense fallback={<PartsLoading />}>
      <PartsCatalogPageClient canManageStock stockTabLabel={stockTabLabel} />
    </Suspense>
  );
}
