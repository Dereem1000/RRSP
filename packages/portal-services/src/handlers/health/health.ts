// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { getPlatformHealthProbeDetails } from '@cd-v2/security';
import { getDatabasePath, testConnection } from '@web/lib/db';

const HEALTH_DETAILS_CACHE_MS = 20_000;
const HEALTH_DETAILS_TIMEOUT_MS = 5_000;

type HealthWorkerDetails = Awaited<ReturnType<typeof getPlatformHealthProbeDetails>>['worker'];
type HealthLicenseDetails = Awaited<ReturnType<typeof getPlatformHealthProbeDetails>>['license'];

let healthDetailsCache:
  | {
      at: number;
      security: HealthWorkerDetails | null;
      license: HealthLicenseDetails | null;
    }
  | null = null;

async function getCachedHealthDetails(): Promise<{
  security: HealthWorkerDetails | null;
  license: HealthLicenseDetails | null;
}> {
  const now = Date.now();
  if (healthDetailsCache && now - healthDetailsCache.at < HEALTH_DETAILS_CACHE_MS) {
    return {
      security: healthDetailsCache.security,
      license: healthDetailsCache.license,
    };
  }

  let security: HealthWorkerDetails | null = null;
  let license: HealthLicenseDetails | null = null;
  try {
    const details = await Promise.race([
      getPlatformHealthProbeDetails(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('health details timeout')), HEALTH_DETAILS_TIMEOUT_MS);
      }),
    ]);
    security = details.worker;
    license = details.license;
    healthDetailsCache = { at: now, security, license };
  } catch {
    if (healthDetailsCache) {
      return {
        security: healthDetailsCache.security,
        license: healthDetailsCache.license,
      };
    }
    security = null;
    license = null;
  }

  return { security, license };
}


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    await testConnection();
    const { security, license } = await getCachedHealthDetails();

    return { status: 200, body: {
      success: true,
      status: 'ok',
      version: '2.1.0',
      showcase: process.env.DEMO_MODE === 'true',
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
    } };
  } catch (error) {
    return { status: 503, body: {
        success: false,
        status: 'degraded',
        error: error instanceof Error ? error.message : 'Unknown error',
      } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

