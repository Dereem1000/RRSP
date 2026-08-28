// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import { listSellerPayables } from '@web/lib/parts-seller-payables';

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
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const params = searchParamsFrom(ctx);
    const statusRaw = params.get('status');
    const status =
      statusRaw === 'owed' || statusRaw === 'paid_out' || statusRaw === 'all'
        ? statusRaw
        : 'all';
    const sellerClientId = params.get('sellerClientId');
    const limit = Number(params.get('limit') || 200);

    const result = await listSellerPayables({
      sellerClientId,
      status,
      limit,
    });

    return {
      status: 200,
      body: {
        success: true,
        payables: result.payables,
        totals: result.totals,
      },
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
