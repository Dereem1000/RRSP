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

import {
  createOpportunity,
  getPipelineStats,
  listOpportunities,
} from '@web/lib/sales';
import type { SalesProduct } from '@cd-v2/database';


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

    const searchParams = searchParamsFrom(ctx);
    const stage = searchParams.get('stage') as 'active' | 'closed' | null;
    const product = searchParams.get('product') as SalesProduct | null;

    const [opportunities, stats] = await Promise.all([
      listOpportunities({
        stage: stage ?? undefined,
        product: product ?? undefined,
      }),
      getPipelineStats(),
    ]);

    return { status: 200, body: { success: true, opportunities, stats } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const body = ctx.body as Record<string, unknown>;
    const companyName = body.companyName?.trim();
    const contactName = body.contactName?.trim();
    const product = body.product;

    if (!companyName || !contactName || !product) {
      return { status: 400, body: { success: false, message: 'Company name, contact name, and product are required' } };
    }

    const opportunity = await createOpportunity({
      companyName,
      contactName,
      email: body.email,
      phone: body.phone,
      address: body.address,
      product,
      pitchNotes: body.pitchNotes,
      clientId: body.clientId || null,
      createdBy: session.id,
    });

    return { status: 201, body: { success: true, opportunity } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

