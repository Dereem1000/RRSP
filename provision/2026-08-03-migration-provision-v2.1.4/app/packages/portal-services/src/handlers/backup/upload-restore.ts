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
import path from 'path';
import { getBackupDir, restoreFromUpload } from '@cd-v2/backup';
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

async function getFormDataFromCtx(ctx: ApiContext): Promise<FormData> {
  if (ctx.formData) return ctx.formData;
  throw new Error('Multipart form data not available');
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = await requireBackupAdmin(ctx);
    const form = await getFormDataFromCtx(ctx);
    const file = form.get('file');
    const restoreType = String(form.get('restoreType') ?? 'database');
    const overwrite = form.get('overwrite') === 'true';
    const authorization = form.get('authorization')?.toString();

    requireCls1ForFullRestore(session, restoreType, overwrite);

    if (restoreType === 'full' || restoreType === 'license') {
      if (!authorization) {
        return { status: 400, body: { success: false, message: 'Authorization required for full restore' } };
      }
      const auth = await validateEmergencyAuthorization(
        authorization,
        session.clearance ?? 'S-CLS3'
      );
      if (!auth.valid) throw new Error(auth.reason);
    }

    if (!(file instanceof File)) {
      return { status: 400, body: { success: false, message: 'ZIP file required' } };
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const tempPath = path.join(getBackupDir(), `upload-restore-${Date.now()}.zip`);
    fs.writeFileSync(tempPath, buf);

    try {
      await restoreFromUpload(
        tempPath,
        restoreType as 'full' | 'database' | 'files',
        overwrite
      );
    } finally {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }

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

