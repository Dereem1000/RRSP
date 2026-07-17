import { Suspense } from 'react';
import { headers } from 'next/headers';
import { LoginForm } from '@/components/LoginForm';
import { getShowcasePortalStatus } from '@/lib/showcase-dock';

function LoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      Loading sign in…
    </div>
  );
}

export default async function LoginPage() {
  const hdrs = await headers();
  const status = await getShowcasePortalStatus({ requestHost: hdrs.get('host') });

  return (
    <Suspense fallback={<LoginLoading />}>
      <LoginForm demoPortalUrl={status.available ? status.loginUrl : null} />
    </Suspense>
  );
}
