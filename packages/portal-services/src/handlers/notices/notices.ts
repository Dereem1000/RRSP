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
import { getRecentNotices } from '@web/lib/notices';


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
    requireRole(session, 'admin', 'technician', 'client');

    let clientId: string | null = null;
    if (session.role === 'client') {
      const client = await Client.findOne({ where: { userId: session.id } });
      clientId = client?.id ?? null;
    }

    const notices = await getRecentNotices(session.role, 8, {
      userId: session.id,
      clientId,
    });
    return { status: 200, body: {
      success: true,
      notices: notices.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        priority: n.priority,
        category: n.category,
        isPinned: n.isPinned,
        publishAt: n.publishAt,
      })),
    } };
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

