import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { getBackupDir, restoreFromUpload } from '@cd-v2/backup';
import { validateEmergencyAuthorization } from '@cd-v2/security';
import {
  authErrorResponse,
  requireBackupAdmin,
  requireCls1ForFullRestore,
} from '@/lib/backup-api';

export async function POST(req: NextRequest) {
  try {
    const session = await requireBackupAdmin(req);
    const form = await req.formData();
    const file = form.get('file');
    const restoreType = String(form.get('restoreType') ?? 'database');
    const overwrite = form.get('overwrite') === 'true';
    const authorization = form.get('authorization')?.toString();

    requireCls1ForFullRestore(session, restoreType, overwrite);

    if (restoreType === 'full' || restoreType === 'license') {
      if (!authorization) {
        return NextResponse.json(
          { success: false, message: 'Authorization required for full restore' },
          { status: 400 }
        );
      }
      const auth = await validateEmergencyAuthorization(
        authorization,
        session.clearance ?? 'S-CLS3'
      );
      if (!auth.valid) throw new Error(auth.reason);
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: 'ZIP file required' }, { status: 400 });
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

    return NextResponse.json({ success: true, message: 'Restore completed' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Restore failed';
    return NextResponse.json({ success: false, message: msg }, { status: 400 });
  }
}
