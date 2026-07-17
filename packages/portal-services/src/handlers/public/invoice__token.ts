// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { getInvoiceById } from '@web/lib/accounting';
import { getQuoteSettings } from '@web/lib/quote-settings';
import { verifyViewToken } from '@web/lib/view-tokens';


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
    const { token } = ctx.params;
    const payload = verifyViewToken(decodeURIComponent(token));
    if (!payload || payload.purpose !== 'invoice_view') {
      return { status: 401, body: {
          success: false,
          message: 'This link is invalid or has expired. Please contact Computer Dynamics for a new invoice link.',
        } };
    }

    const invoice = await getInvoiceById(payload.invoiceId);
    if (!invoice) {
      return { status: 404, body: { success: false, message: 'Invoice not found' } };
    }

    const settings = await getQuoteSettings();
    return { status: 200, body: {
      success: true,
      invoice,
      branding: {
        companyName: settings.companyName,
        companyLogo: settings.companyLogo,
        companyAddress: settings.companyAddress,
        companyPhone: settings.companyPhone,
        companyWebsite: settings.companyWebsite,
      },
    } };
  } catch (error) {
    console.error('[PUBLIC INVOICE]', error);
    return { status: 500, body: { success: false, message: 'Failed to load invoice' } };
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

