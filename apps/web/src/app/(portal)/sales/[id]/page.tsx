import { notFound } from 'next/navigation';
import { Client } from '@/lib/db';
import { requirePortalUser } from '@/lib/session';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { getOpportunityById } from '@/lib/sales';
import { SalesGuidedClient } from '@/components/sales/SalesGuidedClient';

type PageProps = { params: Promise<{ id: string }> };

export default async function SalesDetailPage({ params }: PageProps) {
  const { user } = await requirePortalUser();
  if (user.role === 'client') notFound();

  const { id } = await params;
  const [opportunity, clients] = await Promise.all([
    getOpportunityById(id),
    Client.findAll({ attributes: [...CLIENT_PICKER_ATTRIBUTES], order: [['name', 'ASC']] }),
  ]);
  if (!opportunity) notFound();

  return (
    <SalesGuidedClient
      opportunity={opportunity as import('@/components/sales/SalesGuidedClient').Opportunity}
      clients={clients.map((c) => mapClientToPickerOption(c))}
      isAdmin={user.role === 'admin'}
    />
  );
}