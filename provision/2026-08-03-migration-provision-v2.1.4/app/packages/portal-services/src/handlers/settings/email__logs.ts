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

import { listEmailLogs, type EmailLogCategory } from '@web/lib/email-log';


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
    requireRole(session, 'admin');

    const searchParams = searchParamsFrom(ctx);
    const page = Number(searchParams.get('page') ?? '1');
    const limit = Number(searchParams.get('limit') ?? '50');
    const category = searchParams.get('category') as EmailLogCategory | null;

    const result = await listEmailLogs({
      page,
      limit,
      category: category || undefined,
    });

    return { status: 200, body: { success: true, ...result } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load email logs';
    const status = message.includes('Unauthorized') || message.includes('Forbidden') ? 403 : 500;
    return { status: 200, body: { success: false, message } };
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

