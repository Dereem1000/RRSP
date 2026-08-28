import { Suspense } from 'react';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { listOpportunities, getPipelineStats } from '@/lib/sales';
import { getShopClientModel } from '@/lib/rrsp-db';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { SalesPipelineClient } from '@/components/sales/SalesPipelineClient';

function SalesLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading sales…
    </div>
  );
}

export default async function RrspSalesPage() {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'sales');

  return withOptionalRrspDb(gate, async () => {
    const ShopClient = getShopClientModel();
    const [opportunities, stats, clients] = await Promise.all([
      listOpportunities(),
      getPipelineStats(),
      ShopClient.findAll({
        attributes: [...CLIENT_PICKER_ATTRIBUTES],
        order: [['name', 'ASC']],
      }),
    ]);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shop sales</h1>
          <p className="mt-1 text-sm text-slate-500">Sales pipeline for your shop</p>
        </div>
        <Suspense fallback={<SalesLoading />}>
          <SalesPipelineClient
            opportunities={opportunities as import('@/components/sales/SalesPipelineClient').OpportunityRow[]}
            stats={stats}
            clients={clients.map((c) => mapClientToPickerOption(c as never))}
            pathPrefix="/rrsp"
          />
        </Suspense>
      </div>
    );
  });
}
