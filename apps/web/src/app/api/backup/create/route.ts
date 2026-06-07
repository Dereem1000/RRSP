import { NextRequest, NextResponse } from 'next/server';
import { createBackupJob } from '@cd-v2/backup';
import type { BackupType } from '@cd-v2/database';
import { authErrorResponse, requireBackupAdmin } from '@/lib/backup-api';

const VALID = ['full', 'database', 'files', 'license', 'manual'] as const;

export async function POST(req: NextRequest) {
  try {
    await requireBackupAdmin(req);
    const body = await req.json();
    const backupType = (body.backupType ?? 'full') as BackupType;
    if (!VALID.includes(backupType as (typeof VALID)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid backup type' }, { status: 400 });
    }
    const backup = await createBackupJob(backupType, body.notes);
    return NextResponse.json({ success: true, message: 'Backup completed', backup }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Backup failed';
    return NextResponse.json({ success: false, message: msg }, { status: 400 });
  }
}
