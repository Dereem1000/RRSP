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

import { restoreBackupById } from '@cd-v2/backup';
import { validateEmergencyAuthorization } from '@cd-v2/security';
import {
  authErrorResponse,
  requireBackupAdmin,
  requireCls1ForFullRestore,
} from '@web/lib/backup-api';
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
    const session = await requireBackupAdmin(ctx);
    const { id } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    const restoreType = body.restoreType ?? 'database';
    const overwrite = Boolean(body.overwrite);

    requireCls1ForFullRestore(session, restoreType, overwrite);

    if (body.authorization) {
      const auth = await validateEmergencyAuthorization(
        String(body.authorization),
        session.clearance ?? 'S-CLS3'
      );
      if (!auth.valid) throw new Error(auth.reason);
    } else if (restoreType === 'full' || restoreType === 'license') {
      return { status: 400, body: { success: false, message: 'Authorization code required for full restore' } };
    }

    await restoreBackupById(id, restoreType, overwrite);
    return { status: 200, body: { success: true, message: 'Restore completed' } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Restore failed';
    return { status: 400, body: { success: false, message: msg } };
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

