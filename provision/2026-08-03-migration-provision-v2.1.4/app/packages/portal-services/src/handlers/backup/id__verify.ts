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

import { verifyBackupById } from '@cd-v2/backup';
import { authErrorResponse, requireBackupAdmin } from '@web/lib/backup-api';
import { requireBackupAdmin, requireCls1ForFullRestore } from '../../backup-helpers';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    await requireBackupAdmin(ctx);
    const { id } = ctx.params;
    const result = await verifyBackupById(id);
    return { status: 200, body: { success: true, ...result } };
  } catch (e) {
    return authErrorResult(e);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

