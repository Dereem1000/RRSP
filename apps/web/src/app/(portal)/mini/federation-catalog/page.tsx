import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { getMiniDockSettings, isMiniDockConfigured } from '@/lib/mini-dock';
import { FederationCatalogPageClient } from '@/components/mini/catalog-library/FederationCatalogPageClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Federation catalog',
};

function Loading() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
      Loading federation catalog…
    </div>
  );
}

export default async function FederationCatalogPage() {
  const token = (await cookies()).get('cd_access_token')?.value;
  const session = token ? verifyToken(token) : null;
  if (!session || session.role !== 'admin') {
    redirect('/dashboard');
  }

  const configured = await isMiniDockConfigured();
  if (!configured) {
    redirect('/settings?tab=integrations');
  }

  await getMiniDockSettings();

  return (
    <Suspense fallback={<Loading />}>
      <FederationCatalogPageClient />
    </Suspense>
  );
}
