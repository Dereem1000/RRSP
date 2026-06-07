import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { User, publicUser } from '@/lib/db';
import { getGeneralSettings } from '@/lib/settings';
import { PortalShell } from '@/components/PortalShell';

export const dynamic = 'force-dynamic';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('cd_access_token')?.value;
  const session = token ? verifyToken(token) : null;

  if (!session) redirect('/login');

  const [user, general] = await Promise.all([
    User.findByPk(session.id, {
      attributes: { exclude: ['password', 'tempPassword'] },
    }),
    getGeneralSettings(),
  ]);
  if (!user) redirect('/login');

  return (
    <PortalShell user={publicUser(user)} demoMode={general.demoMode}>
      {children}
    </PortalShell>
  );
}
