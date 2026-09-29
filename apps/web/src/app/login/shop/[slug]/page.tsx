import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';
import { ShopLoginLoadingShell } from '@/components/ShopLoginLoadingShell';
import { getRrspShopLoginPublicInfo } from '@/lib/rrsp-shop-staff';

function ShopLoginLoading() {
  return <ShopLoginLoadingShell />;
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
