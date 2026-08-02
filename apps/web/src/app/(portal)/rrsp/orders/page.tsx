import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { getShopClientModel } from '@/lib/rrsp-db';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { StaffOrdersPageClient } from '@/components/orders/StaffOrdersPageClient';

/** Shop orders — list/create against the shop rrsp.db (not MSP "my orders"). */
export default async function RrspOrdersPage() {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'orders');

  return withOptionalRrspDb(gate, async () => {
    const ShopClient = getShopClientModel();
    const clients = await ShopClient.findAll({
      where: { isActive: true },
      attributes: [...CLIENT_PICKER_ATTRIBUTES],
      order: [['name', 'ASC']],
    });

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shop orders</h1>
          <p className="mt-1 text-sm text-slate-500">Orders for your repair shop customers</p>
        </div>
        <StaffOrdersPageClient
          isAdmin
          clients={clients.map((c) => mapClientToPickerOption(c as never))}
          hidePageChrome
          allowSkipUsCost
        />
      </div>
    );
  });
}
