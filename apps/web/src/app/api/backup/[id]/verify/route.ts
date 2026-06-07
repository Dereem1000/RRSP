import { NextRequest, NextResponse } from 'next/server';
import { verifyBackupById } from '@cd-v2/backup';
import { authErrorResponse, requireBackupAdmin } from '@/lib/backup-api';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireBackupAdmin(req);
    const { id } = await params;
    const result = await verifyBackupById(id);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return authErrorResponse(e);
  }
}
