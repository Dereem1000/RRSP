import { NextRequest, NextResponse } from 'next/server';
import { restoreBackupById } from '@cd-v2/backup';
import { validateEmergencyAuthorization } from '@cd-v2/security';
import {
  authErrorResponse,
  requireBackupAdmin,
  requireCls1ForFullRestore,
} from '@/lib/backup-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireBackupAdmin(req);
    const { id } = await params;
    const body = await req.json();
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
      return NextResponse.json(
        { success: false, message: 'Authorization code required for full restore' },
        { status: 400 }
      );
    }

    await restoreBackupById(id, restoreType, overwrite);
    return NextResponse.json({ success: true, message: 'Restore completed' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Restore failed';
    return NextResponse.json({ success: false, message: msg }, { status: 400 });
  }
}
