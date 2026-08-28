import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import {
  getDefaultMiniPublicUrl,
  getMiniDockSettings,
  isMiniDockConfigured,
  resolveMiniLocalBaseUrl,
} from '@/lib/mini-dock';
import { MiniDashboardClient } from '@/components/mini/MiniDashboardClient';

export const dynamic = 'force-dynamic';

function MiniLoading() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
      Loading Mini dashboard…
    </div>
  );
}
function isBrowserOnLocalHost(hostHeader: string): boolean {
  const host = hostHeader.split(',')[0]?.trim().split(':')[0]?.toLowerCase() || '';
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1';
}

export default async function MiniPage() {
  const token = (await cookies()).get('cd_access_token')?.value;
  const session = token ? verifyToken(token) : null;
  if (!session || session.role !== 'admin') {
    redirect('/dashboard');
  }

  const configured = await isMiniDockConfigured();
  if (!configured) {
    redirect('/settings?tab=integrations');
  }

  const settings = await getMiniDockSettings();
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || '';
  const miniDashboardUrl = isBrowserOnLocalHost(host)
    ? resolveMiniLocalBaseUrl(settings)
    : settings.publicUrl.trim().replace(/\/$/, '') || getDefaultMiniPublicUrl();

  return (
    <Suspense fallback={<MiniLoading />}>
      <MiniDashboardClient miniDashboardUrl={miniDashboardUrl} />
    </Suspense>
  );
}