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

import { Client } from '@web/lib/db';
import { serializeClient } from '@web/lib/clients';
import { activationFeaturesWhereOptions } from '@web/lib/activation-features-query';


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
    await requireMspApiAuth(ctx);

    const searchParams = searchParamsFrom(ctx);
    const page = Math.max(1, Number(searchParams.get('page') ?? 1));
    const limit = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? 100)));
    const offset = (page - 1) * limit;

    const { rows, count } = await Client.findAndCountAll({
      where: activationFeaturesWhereOptions(),
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    return { status: 200, body: {
      success: true,
      clients: rows.map(serializeClient),
      pagination: {
        total: count,
        page,
        limit,
        pages: Math.ceil(count / limit),
      },
    } };
  } catch (error) {
    return mspAuthErrorResult(error);
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

