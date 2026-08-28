import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { getShopClientModel } from '@/lib/rrsp-db';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { listShopPosProducts, ensureWalkInPosClient } from '@/lib/pos-catalog';
import { isRrspShopDemoActive } from '@/lib/rrsp-demo';
import { seedRrspPosDemoData } from '@/lib/pos-demo';
import { PosPageClient } from '@/components/pos/PosPageClient';

function PosLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">Loading shop POS…</div>
  );
}

/** RRSP shop POS — catalog + invoices in the shop rrsp.db only. */
export default async function RrspPosPage() {
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

    const ShopClient = getShopClientModel();
    const [products, walkIn] = await Promise.all([listShopPosProducts(), ensureWalkInPosClient()]);
    const clientsRaw = await ShopClient.findAll({
      where: { isActive: true },
      attributes: [...CLIENT_PICKER_ATTRIBUTES],
      order: [['name', 'ASC']],
    });
    const clients = clientsRaw.map((c) => mapClientToPickerOption(c as never));
    if (!clients.some((c) => c.id === walkIn.id)) {
      clients.unshift({ id: walkIn.id, name: walkIn.name, companyName: 'Walk-in / Counter' });
    }

    return (
      <Suspense fallback={<PosLoading />}>
        <PosPageClient
          mode="rrsp"
          initialProducts={products}
          clients={clients}
          walkInClientId={walkIn.id}
          accountingHref="/rrsp/accounting"
          canManageProducts
        />
      </Suspense>
    );
  });
}
