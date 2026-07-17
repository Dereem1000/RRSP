import { requirePortalUser } from '@/lib/session';
import { getGeneralSettings } from '@/lib/settings';
import { PortalShell } from '@/components/PortalShell';

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const [{ user }, general] = await Promise.all([requirePortalUser(), getGeneralSettings()]);

  return (
    <PortalShell user={user} demoMode={general.demoMode}>
      {children}
    </PortalShell>
  );
}
