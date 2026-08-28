import { notFound, redirect } from 'next/navigation';
import { Op } from 'sequelize';
import { User } from '@/lib/db';
import { requirePortalUser } from '@/lib/session';
import { buildUsageInfo, getClientBilling, getClientById, resolveClientActivationFeatures, serializeClient } from '@/lib/clients';
import { ClientDetailClient } from '@/components/clients/ClientDetailClient';
import { getActivationFeatures } from '@/lib/license-constants';

type PageProps = { params: Promise<{ id: string }> };

export default async function ClientDetailPage({ params }: PageProps) {
  const { user } = await requirePortalUser();
  if (user.role === 'client') redirect('/tickets');

  const { id } = await params;
  const client = await getClientById(id);
  if (!client) notFound();

  const technicians = await User.findAll({
    where: { isActive: true, role: { [Op.in]: ['admin', 'technician'] } },
    attributes: ['id', 'firstName', 'lastName'],
    order: [['firstName', 'ASC']],
  });

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
  const usage = buildUsageInfo(client.usageTracking as Record<string, number>);
  const billing = getClientBilling(client);

  return (
    <ClientDetailClient
      client={serialized as Parameters<typeof ClientDetailClient>[0]['client']}
      userRole={user.role}
      technicians={technicians.map((t) => ({
        id: t.id,
        firstName: t.firstName,
        lastName: t.lastName,
      }))}
      initialUsage={usage}
      initialBilling={{
        monthlyRate: billing.monthlyRate,
        billingCycle: billing.billingCycle,
        contractStartDate: billing.contractStartDate ? String(billing.contractStartDate) : null,
        contractEndDate: billing.contractEndDate ? String(billing.contractEndDate) : null,
        renewalDate: billing.renewalDate ? String(billing.renewalDate) : null,
        nextBillingDate: billing.nextBillingDate ? String(billing.nextBillingDate) : null,
        isContractActive: billing.isContractActive,
      }}
    />
  );
}
