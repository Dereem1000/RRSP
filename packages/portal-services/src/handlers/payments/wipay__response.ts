// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';

import { recordWiPayPayment } from '@web/lib/wipay';
import { resolvePublicSiteBaseUrl } from '@web/lib/site-url';
import {
  getRequestPublicOriginFromCtx,
  redirectResult,
  wipayParamsFromCtx,
} from '../../http-helpers';

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  const params = wipayParamsFromCtx(ctx);
  const base = await resolvePublicSiteBaseUrl(getRequestPublicOriginFromCtx(ctx));
  const result = await recordWiPayPayment(params);

  if (!result.ok) {
    const message = encodeURIComponent(result.reason);
    return redirectResult(`${base}/billing?payment=failed&message=${message}`);
  }

  const invoiceId = encodeURIComponent(result.invoiceId ?? '');
  const status = result.duplicate ? 'duplicate' : 'success';
  return redirectResult(`${base}/billing?invoice=${invoiceId}&payment=${status}`);
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Payment processing failed';
    return { status: 500, body: { success: false, message } };
  }
}
