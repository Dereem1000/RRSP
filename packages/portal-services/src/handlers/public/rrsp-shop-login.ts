// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { getRrspShopLoginPublicInfo } from '@web/lib/rrsp-shop-staff';

function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  const params = searchParamsFrom(ctx);
  const slug = String(params.get('slug') ?? '').trim();
  const shop = await getRrspShopLoginPublicInfo(slug);

  if (!shop) {
    return { status: 404, body: { success: false, message: 'Shop login not found' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      companyName: shop.companyName,
      logoUrl: shop.logoUrl,
      hasCustomLogo: shop.hasCustomLogo,
      staffLoginEnabled: shop.staffLoginEnabled,
      shopLoginSlug: shop.shopLoginSlug,
    },
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  };
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  if (method === 'GET') return GETHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
