import { NextRequest, NextResponse } from 'next/server';
import { deleteBackup, getBackupById } from '@cd-v2/backup';
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
    return NextResponse.json({ success: true, backup });
  } catch (e) {
    return authErrorResponse(e);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireBackupAdmin(req);
    const { id } = await params;
    await deleteBackup(id);
    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (e) {
    return authErrorResponse(e);
  }
}
