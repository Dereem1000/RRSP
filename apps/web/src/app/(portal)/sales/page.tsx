import { Suspense } from 'react';
import { requireStaffUser } from '@/lib/session';
import { Client } from '@/lib/db';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { listOpportunities, getPipelineStats, isSalesStagingClient } from '@/lib/sales';
import { SalesPipelineClient } from '@/components/sales/SalesPipelineClient';

function SalesLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading sales…
    </div>
  );
}

export default async function SalesPage() {
  await requireStaffUser();

  const [opportunities, stats, allClients] = await Promise.all([
    listOpportunities(),
    getPipelineStats(),
    Client.findAll({ attributes: [...CLIENT_PICKER_ATTRIBUTES], order: [['name', 'ASC']] }),
  ]);

  const clients = allClients
    .filter((c) => !isSalesStagingClient(c.contractDetails))
    .map((c) => mapClientToPickerOption(c));

  return (
    <Suspense fallback={<SalesLoading />}>
      <SalesPipelineClient
        opportunities={opportunities as import('@/components/sales/SalesPipelineClient').OpportunityRow[]}
        stats={stats}
        clients={clients}
      />
    </Suspense>
  );
}
