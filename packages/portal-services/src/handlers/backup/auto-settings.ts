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

import { ensureAutoBackupConfig, saveAutoBackupConfig, type AutoBackupConfig } from '@cd-v2/backup';
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


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    await requireBackupAdmin(ctx);
    const config = await ensureAutoBackupConfig();
    return { status: 200, body: { success: true, config } };
  } catch (e) {
    return authErrorResult(e);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = await requireBackupAdmin(ctx);
    if (session.clearance !== 'S-CLS1') {
      return { status: 403, body: { success: false, message: 'S-CLS1 required to change auto-backup settings' } };
    }
    const body = ctx.body as Record<string, unknown>;
    const config = await saveAutoBackupConfig(body as AutoBackupConfig);
    return { status: 200, body: { success: true, config } };
  } catch (e) {
    return authErrorResult(e);
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

