import { redirect } from 'next/navigation';
import { requirePortalUser } from '@/lib/session';
import { getClientRrspAccess } from '@/lib/rrsp-access';
import { getRrspDashboardOverview } from '@/lib/rrsp-dashboard';
import { RrspShopHome } from '@/components/rrsp/RrspShopHome';

export default async function RrspShopHomePage() {
  const { user } = await requirePortalUser();
  const access = await getClientRrspAccess(user.id);

  if (!access.enabled || !access.mspClientId) {
    redirect('/dashboard');
  }

  const overview = await getRrspDashboardOverview(access.mspClientId).catch(() => null);
  if (!overview) {
    redirect('/dashboard');
  }

  return (
    <RrspShopHome
      modules={access.modules}
      overview={overview}
      isStaff={Boolean(access.isShopStaff)}
    />
  );
}
