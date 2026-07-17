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

import fs from 'fs';
import { getBackupById } from '@cd-v2/backup';
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
    const { id } = ctx.params;
    const backup = await getBackupById(id);
    if (!backup) {
      return { status: 404, body: { success: false, message: 'Not found' } };
    }
    if (!fs.existsSync(backup.filePath)) {
      return { status: 404, body: { success: false, message: 'File missing' } };
    }
    const buf = fs.readFileSync(backup.filePath);
    return { status: 200, rawBody: buf, headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${backup.backupName}"`,
      } };
  } catch (e) {
    return authErrorResult(e);
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

