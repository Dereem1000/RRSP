import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { getShopClientModel } from '@/lib/rrsp-db';
import { serializeClient } from '@/lib/clients';
import { StatCard } from '@/components/dashboard/StatCard';
import { ClientsPageClient } from '@/components/clients/ClientsPageClient';
import { Building2, CheckCircle2, PauseCircle, Clock } from 'lucide-react';

export default async function RrspClientsPage() {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'clients');

  return withOptionalRrspDb(gate, async () => {
    const ShopClient = getShopClientModel();
    const clients = await ShopClient.findAll({ order: [['created_at', 'DESC']] });
    const active = clients.filter((c) => (c as { status?: string }).status === 'active').length;
    const pending = clients.filter((c) => (c as { status?: string }).status === 'pending').length;
    const inactive = clients.filter((c) => {
      const status = (c as { status?: string }).status;
      return status === 'inactive' || status === 'suspended';
    }).length;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Customers</h1>
          <p className="mt-1 text-sm text-slate-500">End customers of your repair shop</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total" value={clients.length} icon={Building2} accent="bg-indigo-50 text-indigo-600" />
          <StatCard label="Active" value={active} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-600" />
          <StatCard label="Pending" value={pending} icon={Clock} accent="bg-blue-50 text-blue-600" />
          <StatCard label="Inactive" value={inactive} icon={PauseCircle} accent="bg-slate-100 text-slate-600" />
        </div>

        <ClientsPageClient
          clients={clients.map(
            (c) => serializeClient(c as never) as import('@/components/clients/ClientsPageClient').ClientRow
          )}
          licenseMap={{}}
          userRole={user.role}
        />
      </div>
    );
  });
}
