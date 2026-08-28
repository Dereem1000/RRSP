import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { getShopClientModel } from '@/lib/rrsp-db';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { AccountingPageClient } from '@/components/accounting/AccountingPageClient';

function AccountingLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading accounting…
    </div>
  );
}

export default async function RrspAccountingPage() {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'accounting');

  return withOptionalRrspDb(gate, async () => {
    const ShopClient = getShopClientModel();
    const clients = await ShopClient.findAll({
      attributes: [...CLIENT_PICKER_ATTRIBUTES],
      order: [['name', 'ASC']],
    });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shop accounting</h1>
          <p className="mt-1 text-sm text-slate-500">Invoices and quotes for your shop customers</p>
        </div>
        <Suspense fallback={<AccountingLoading />}>
          <AccountingPageClient
            isAdmin={false}
            clients={clients.map((c) => mapClientToPickerOption(c as never))}
            apiBase="/api/rrsp"
            portalPathPrefix="/rrsp"
            hidePageHeader
          />
        </Suspense>
      </div>
    );
  });
}
