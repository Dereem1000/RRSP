import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { isDemoSandboxActive } from '@cd-v2/database';
import { requirePortalUser, requireStaffUser } from '@/lib/session';
import { Client } from '@/lib/db';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { listCdPosProducts, ensureWalkInPosClient } from '@/lib/pos-catalog';
import { seedCdPosDemoData } from '@/lib/pos-demo';
import { PosPageClient } from '@/components/pos/PosPageClient';

function PosLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">Loading POS…</div>
  );
}

/** CD staff counter POS — POS catalog + Our Stock Parts + CD invoices. */
export default async function PosPage() {
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

  const [products, walkIn] = await Promise.all([listCdPosProducts(), ensureWalkInPosClient()]);
  const allClients = await Client.findAll({
    attributes: [...CLIENT_PICKER_ATTRIBUTES],
    where: { isActive: true },
    order: [['name', 'ASC']],
  });

  const clients = allClients.map((c) => mapClientToPickerOption(c));
  if (!clients.some((c) => c.id === walkIn.id)) {
    clients.unshift({ id: walkIn.id, name: walkIn.name, companyName: 'Walk-in / Counter' });
  }

  return (
    <Suspense fallback={<PosLoading />}>
      <PosPageClient
        mode="cd"
        initialProducts={products}
        clients={clients}
        walkInClientId={walkIn.id}
        accountingHref="/accounting"
        canManageProducts
      />
    </Suspense>
  );
}
