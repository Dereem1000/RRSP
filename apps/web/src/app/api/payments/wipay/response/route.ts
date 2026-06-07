import { NextRequest, NextResponse } from 'next/server';
import { recordWiPayPayment, type WiPayResponseParams } from '@/lib/wipay';
import { getRequestPublicOrigin, resolvePublicSiteBaseUrl } from '@/lib/site-url';

function collectParams(req: NextRequest): WiPayResponseParams {
  const params: WiPayResponseParams = {};
  for (const [key, value] of req.nextUrl.searchParams.entries()) {
    params[key as keyof WiPayResponseParams] = value;
  }
  return params;
}

export async function GET(req: NextRequest) {
  const params = collectParams(req);
  const base = await resolvePublicSiteBaseUrl(getRequestPublicOrigin(req));
  const result = await recordWiPayPayment(params);

  if (!result.ok) {
    const message = encodeURIComponent(result.reason);
    return NextResponse.redirect(`${base}/billing?payment=failed&message=${message}`);
  }

  const invoiceId = encodeURIComponent(result.invoiceId);
  const status = result.duplicate ? 'duplicate' : 'success';
  return NextResponse.redirect(`${base}/billing?invoice=${invoiceId}&payment=${status}`);
}
