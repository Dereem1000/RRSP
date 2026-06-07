import { NextRequest, NextResponse } from 'next/server';
import { getAutoBackupConfig, saveAutoBackupConfig, type AutoBackupConfig } from '@cd-v2/backup';
import { authErrorResponse, requireBackupAdmin } from '@/lib/backup-api';

export async function GET(req: NextRequest) {
  try {
    await requireBackupAdmin(req);
    const config = await getAutoBackupConfig();
    return NextResponse.json({ success: true, config });
  } catch (e) {
    return authErrorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireBackupAdmin(req);
    if (session.clearance !== 'S-CLS1') {
      return NextResponse.json(
        { success: false, message: 'S-CLS1 required to change auto-backup settings' },
        { status: 403 }
      );
    }
    const body = await req.json();
    const config = await saveAutoBackupConfig(body as AutoBackupConfig);
    return NextResponse.json({ success: true, config });
  } catch (e) {
    return authErrorResponse(e);
  }
}
