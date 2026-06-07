import { NextRequest, NextResponse } from 'next/server';
import { getAutoBackupConfig, getBackupStatus } from '@cd-v2/backup';
import { authErrorResponse, requireBackupAdmin } from '@/lib/backup-api';

export async function GET(req: NextRequest) {
  try {
    await requireBackupAdmin(req);
    const status = await getBackupStatus();
    const auto = await getAutoBackupConfig();
    return NextResponse.json({
      success: true,
      status,
      auto: auto
        ? {
            enabled: auto.enabled,
            frequency: auto.frequency,
            lastRun: auto.lastRun,
            nextRun: auto.nextRun,
          }
        : null,
    });
  } catch (e) {
    return authErrorResponse(e);
  }
}
