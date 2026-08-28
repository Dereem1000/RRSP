// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { getPublicDemoLogin } from '@web/lib/public-demo-logins';

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
  const product = String(params.get('product') ?? '').trim().toLowerCase();
  const demo = getPublicDemoLogin(product);

  if (!demo) {
    return { status: 404, body: { success: false, message: 'Demo product not found' } };
  }

  return {
    status: 200,
    body: {
      success: true,
      product: demo.product,
      label: demo.label,
      username: demo.username,
      password: demo.password,
      returnUrl: demo.returnUrl,
      autoEnableShopDemo: demo.autoEnableShopDemo,
      staffLogins: demo.staffLogins ?? [],
    },
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  };
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  if (method === 'GET') return GETHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
