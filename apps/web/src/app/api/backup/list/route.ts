import { NextRequest, NextResponse } from 'next/server';
import { listBackups } from '@cd-v2/backup';
import { authErrorResponse, requireBackupAdmin } from '@/lib/backup-api';

export async function GET(req: NextRequest) {
  try {
    await requireBackupAdmin(req);
    const { searchParams } = new URL(req.url);
    const data = await listBackups({
      page: Number(searchParams.get('page') ?? 1),
      limit: Number(searchParams.get('limit') ?? 50),
      status: searchParams.get('status') ?? undefined,
      backupType: searchParams.get('backupType') ?? undefined,
    });
    return NextResponse.json({ success: true, ...data });
  } catch (e) {
    return authErrorResponse(e);
  }
}
