import { notFound } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { getShopClientModel } from '@/lib/rrsp-db';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { getOpportunityById } from '@/lib/sales';
import { SalesGuidedClient } from '@/components/sales/SalesGuidedClient';

type PageProps = { params: Promise<{ id: string }> };

export default async function RrspSalesDetailPage({ params }: PageProps) {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'sales');
  const { id } = await params;

  return withOptionalRrspDb(gate, async () => {
    const ShopClient = getShopClientModel();
    const [opportunity, clients] = await Promise.all([
      getOpportunityById(id),
      ShopClient.findAll({ attributes: [...CLIENT_PICKER_ATTRIBUTES], order: [['name', 'ASC']] }),
    ]);
    if (!opportunity) notFound();

    return (
      <SalesGuidedClient
        opportunity={opportunity as import('@/components/sales/SalesGuidedClient').Opportunity}
        clients={clients.map((c) => mapClientToPickerOption(c as never))}
        isAdmin
        pathPrefix="/rrsp"
      />
    );
  });
}
