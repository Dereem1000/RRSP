import { NextRequest, NextResponse } from 'next/server';
import { getBackupProgress } from '@cd-v2/backup';
import { authErrorResponse, requireBackupAdmin } from '@/lib/backup-api';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireBackupAdmin(req);
    const { id } = await params;
    const data = await getBackupProgress(id);
    return NextResponse.json({ success: true, ...data });
  } catch (e) {
    return authErrorResponse(e);
  }
}
