import { notFound, redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { getClientById, resolveClientActivationFeatures, serializeClient } from '@/lib/clients';
import { ClientLicensesClient } from '@/components/clients/ClientLicensesClient';
import { getActivationFeatures } from '@/lib/license-constants';

type PageProps = { params: Promise<{ id: string }> };

export default async function ClientLicensesPage({ params }: PageProps) {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/tickets');

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const resolvedFeatures = await resolveClientActivationFeatures(client);
  const storedFeatures = getActivationFeatures(client.features);
  if (
    resolvedFeatures.length > 0 &&
    JSON.stringify(resolvedFeatures) !== JSON.stringify(storedFeatures)
  ) {
    await client.update({ features: resolvedFeatures });
    await client.reload();
  }

  const serialized = serializeClient(client) as Record<string, unknown>;
  serialized.features = resolvedFeatures;

  return (
    <ClientLicensesClient
      client={serialized as Parameters<typeof ClientLicensesClient>[0]['client']}
      isAdmin={user.role === 'admin'}
      isStaff={user.role === 'technician'}
    />
  );
}
