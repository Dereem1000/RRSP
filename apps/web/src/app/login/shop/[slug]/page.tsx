import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { getRrspShopLoginPublicInfo } from '@/lib/rrsp-shop-staff';

function ShopLoginLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      Loading sign in…
    </div>
  );
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export default async function ShopLoginPage({ params }: PageProps) {
  const { slug } = await params;
  const shop = await getRrspShopLoginPublicInfo(slug);
  if (!shop) notFound();

  return (
    <Suspense fallback={<ShopLoginLoading />}>
      <LoginForm
        shopBranding={{
          companyName: shop.companyName,
          logoUrl: shop.logoUrl,
          shopLoginSlug: shop.shopLoginSlug,
        }}
      />
    </Suspense>
  );
}
