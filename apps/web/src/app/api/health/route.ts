import { NextResponse } from 'next/server';
import { getPlatformSecurityStatus } from '@cd-v2/security';
import { getDatabasePath, testConnection } from '@/lib/db';

export async function GET() {
  try {
    await testConnection();
    let security: Awaited<ReturnType<typeof getPlatformSecurityStatus>>['worker'] | null =
      null;
    let license: Awaited<ReturnType<typeof getPlatformSecurityStatus>>['license'] | null = null;
    try {
      const platform = await getPlatformSecurityStatus();
      security = platform.worker;
      license = platform.license;
    } catch {
      security = null;
      license = null;
    }

    return NextResponse.json({
      success: true,
      status: 'ok',
      version: '2.1.0',
      database: getDatabasePath(),
      security: security
        ? {
            worker: security.health,
            lastHeartbeat: security.lastHeartbeat,
            version: security.version,
            checksTotal: security.checksTotal,
          }
        : { worker: 'unknown', lastHeartbeat: null },
      license: license
        ? {
            api: license.status,
            latencyMs: license.latencyMs,
            lastCheck: license.lastCheck,
            dbAvailable: license.dbAvailable,
            activeLicenses: license.activeLicenseCount,
            licenseCount: license.licenseCount,
          }
        : null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
