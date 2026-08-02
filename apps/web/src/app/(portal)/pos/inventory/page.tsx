import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { isDemoSandboxActive } from '@cd-v2/database';
import { requirePortalUser, requireStaffUser } from '@/lib/session';
import { listCdPosInventory } from '@/lib/pos-catalog';
import { seedCdPosDemoData } from '@/lib/pos-demo';
import { PosInventoryPageClient } from '@/components/pos/PosInventoryPageClient';

function InventoryLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading POS inventory…
    </div>
  );
}

/** CD staff POS catalog + Our Stock Parts inventory. */
export default async function PosInventoryPage() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/dashboard');
  await requireStaffUser();

  if (isDemoSandboxActive()) {
    try {
      await seedCdPosDemoData();
    } catch (err) {
      console.warn('[CD DEMO] POS seed skipped:', err instanceof Error ? err.message : err);
    }
  }

  const products = await listCdPosInventory();

  return (
    <Suspense fallback={<InventoryLoading />}>
      <PosInventoryPageClient mode="cd" initialProducts={products} />
    </Suspense>
  );
}
