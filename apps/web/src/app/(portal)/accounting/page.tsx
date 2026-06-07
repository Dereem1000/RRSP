import { redirect } from 'next/navigation';
import { Client } from '@/lib/db';
import { requirePortalUser } from '@/lib/session';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { AccountingPageClient } from '@/components/accounting/AccountingPageClient';

export default async function AccountingPage() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/dashboard');

  const clients = await Client.findAll({
    attributes: [...CLIENT_PICKER_ATTRIBUTES],
    order: [['name', 'ASC']],
  });

  return (
    <AccountingPageClient
      isAdmin={user.role === 'admin'}
      clients={clients.map((c) => mapClientToPickerOption(c))}
    />
  );
}
