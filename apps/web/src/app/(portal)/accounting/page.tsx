import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { Client } from '@/lib/db';
import { requirePortalUser } from '@/lib/session';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { AccountingPageClient } from '@/components/accounting/AccountingPageClient';

function AccountingLoading() {
  return (
    <div className="flex items-center justify-center py-20 text-slate-500">
      Loading accounting…
    </div>
  );
}

export default async function AccountingPage() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/dashboard');

  const clients = await Client.findAll({
    attributes: [...CLIENT_PICKER_ATTRIBUTES],
    order: [['name', 'ASC']],
  });

  return (
    <Suspense fallback={<AccountingLoading />}>
      <AccountingPageClient
        isAdmin={user.role === 'admin'}
        clients={clients.map((c) => mapClientToPickerOption(c))}
      />
    </Suspense>
  );
}
