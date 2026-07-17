import { Client } from '@/lib/db';
import { requirePortalUser } from '@/lib/session';
import { serializeClient } from '@/lib/clients';
import { getClientLicenseBadgeMap } from '@/lib/client-license-map';
import { isSalesStagingClient } from '@/lib/sales';
import { StatCard } from '@/components/dashboard/StatCard';
import { ClientsPageClient } from '@/components/clients/ClientsPageClient';
import { Building2, CheckCircle2, PauseCircle, Clock } from 'lucide-react';

export default async function ClientsPage() {
  const { user } = await requirePortalUser();
  if (user.role === 'client') {
    const { redirect } = await import('next/navigation');
    redirect('/tickets');
  }

  const allClients = await Client.findAll({ order: [['created_at', 'DESC']] });
  const clients = allClients.filter((c) => !isSalesStagingClient(c.contractDetails));
  const licenseMap = await getClientLicenseBadgeMap(clients.map((c) => c.id));
  const active = clients.filter((c) => c.status === 'active').length;
  const pending = clients.filter((c) => c.status === 'pending').length;
  const inactive = clients.filter((c) => c.status === 'inactive' || c.status === 'suspended').length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Clients</h1>
        <p className="mt-1 text-sm text-slate-500">Managed service client accounts</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total" value={clients.length} icon={Building2} accent="bg-indigo-50 text-indigo-600" />
        <StatCard label="Active" value={active} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-600" />
        <StatCard label="Pending" value={pending} icon={Clock} accent="bg-blue-50 text-blue-600" />
        <StatCard label="Inactive" value={inactive} icon={PauseCircle} accent="bg-slate-100 text-slate-600" />
      </div>

      <ClientsPageClient
        clients={clients.map((c) => serializeClient(c) as import('@/components/clients/ClientsPageClient').ClientRow)}
        licenseMap={licenseMap}
        userRole={user.role}
      />
    </div>
  );
}
