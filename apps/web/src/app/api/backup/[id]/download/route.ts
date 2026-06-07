import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import { getBackupById } from '@cd-v2/backup';
import { authErrorResponse, requireBackupAdmin } from '@/lib/backup-api';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireBackupAdmin(req);
    const { id } = await params;
    const backup = await getBackupById(id);
    if (!backup) {
      return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    }
    if (!fs.existsSync(backup.filePath)) {
      return NextResponse.json({ success: false, message: 'File missing' }, { status: 404 });
    }
    const buf = fs.readFileSync(backup.filePath);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${backup.backupName}"`,
      },
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
