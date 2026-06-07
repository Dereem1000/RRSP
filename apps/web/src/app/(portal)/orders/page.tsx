import { redirect } from 'next/navigation';
import { Client } from '@/lib/db';
import { requirePortalUser } from '@/lib/session';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { ClientOrdersPageClient } from '@/components/orders/ClientOrdersPageClient';
import { StaffOrdersPageClient } from '@/components/orders/StaffOrdersPageClient';

export default async function OrdersPage() {
  const { user } = await requirePortalUser();

  if (user.role === 'client') {
    return <ClientOrdersPageClient />;
  }

  const clients = await Client.findAll({
    attributes: [...CLIENT_PICKER_ATTRIBUTES],
    order: [['name', 'ASC']],
  });

  return (
    <StaffOrdersPageClient
      isAdmin={user.role === 'admin'}
      clients={clients.map((c) => mapClientToPickerOption(c))}
    />
  );
}
