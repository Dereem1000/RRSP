import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { isMiniDockActive } from '@/lib/mini-dock';
import { MiniDashboardClient } from '@/components/mini/MiniDashboardClient';

export const dynamic = 'force-dynamic';

export default async function MiniPage() {
  const token = (await cookies()).get('cd_access_token')?.value;
  const session = token ? verifyToken(token) : null;
  if (!session || session.role !== 'admin') {
    redirect('/dashboard');
  }

  const active = await isMiniDockActive();
  if (!active) {
    redirect('/settings?tab=integrations');
  }

  return <MiniDashboardClient />;
}
