import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { listShopPosInventory } from '@/lib/pos-catalog';
import { isRrspShopDemoActive } from '@/lib/rrsp-demo';
import { seedRrspPosDemoData } from '@/lib/pos-demo';
import { PosInventoryPageClient } from '@/components/pos/PosInventoryPageClient';

function InventoryLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading shop POS inventory…
    </div>
  );
}

/** RRSP shop POS catalog + shop Parts stock. */
export default async function RrspPosInventoryPage() {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'pos');

  return withOptionalRrspDb(gate, async () => {
    if (gate.mspClientId && (await isRrspShopDemoActive(gate.mspClientId))) {
      try {
        await seedRrspPosDemoData();
      } catch (err) {
        console.warn('[RRSP DEMO] POS seed skipped:', err instanceof Error ? err.message : err);
      }
    }

    const products = await listShopPosInventory();

    return (
      <Suspense fallback={<InventoryLoading />}>
        <PosInventoryPageClient mode="rrsp" initialProducts={products} />
      </Suspense>
    );
  });
}
