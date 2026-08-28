import { notFound } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule, getClientRrspAccess } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { buildUsageInfo, getClientBilling, getClientById, serializeClient } from '@/lib/clients';
import { ClientDetailClient } from '@/components/clients/ClientDetailClient';

type PageProps = { params: Promise<{ id: string }> };

export default async function RrspClientDetailPage({ params }: PageProps) {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'clients');
  const { id } = await params;
  const access = await getClientRrspAccess(user.id);

  return withOptionalRrspDb(gate, async () => {
    const client = await getClientById(id);
    if (!client) notFound();

    const serialized = serializeClient(client) as Record<string, unknown>;
    const usage = buildUsageInfo(client.usageTracking as Record<string, number>);
    const billing = getClientBilling(client);

    return (
      <ClientDetailClient
        client={serialized as Parameters<typeof ClientDetailClient>[0]['client']}
        userRole={user.role}
        technicians={[]}
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
        pathPrefix="/rrsp"
        shopOperator
        showLicensesTab={false}
        rrspModules={access.modules}
      />
    );
  });
}
