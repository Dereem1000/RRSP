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

import { activationFeaturesWhereOptions } from '@web/lib/activation-features-query';
import { getActivationFeatures } from '@web/lib/license-constants';
import {
  buildLicenseSnapshot,
  getLicenseStatusByMspClientId,
  isLicenseDbAvailable,
  getLicenseDbPathForDisplay,
} from '@web/lib/license-service';
import { licenseSerialsRevealedFromCtx } from '../../http-helpers';
import { redactFeatureLicenseStatusMap } from '@web/lib/license-serial-privacy';
import { Client } from '@web/lib/db';


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
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    if (!isLicenseDbAvailable()) {
      return { status: 200, body: {
        success: true,
        dbAvailable: false,
        dbPath: getLicenseDbPathForDisplay(),
        statuses: [],
        message: 'License database not found. Set LICENSE_DB_PATH in .env',
      } };
    }

    const revealSerials = licenseSerialsRevealedFromCtx(ctx, session.id);

    const clients = await Client.findAll({
      where: activationFeaturesWhereOptions(),
      attributes: ['id', 'name', 'companyName', 'serviceLevel', 'features', 'status'],
    });

    const statuses = [];
    for (const client of clients) {
      const activationFeatures = getActivationFeatures(client.features);

      let license = null;
      try {
        license = await getLicenseStatusByMspClientId(client.id);
      } catch {
        license = null;
      }

      const snapshot = buildLicenseSnapshot(license, activationFeatures);

      statuses.push({
        clientId: client.id,
        clientName: client.companyName || client.name,
        serviceLevel: client.serviceLevel,
        hasLicense: snapshot.hasActiveLicense,
        licenseStatus:
          snapshot.overallStatus === 'Active'
            ? 'Active'
            : snapshot.overallStatus === 'Partial'
              ? 'Partial'
              : snapshot.overallStatus === 'Pending'
                ? 'Pending'
                : 'Not Found',
        overallStatus: snapshot.overallStatus,
        activationFeatures,
        featureLicenseStatus: redactFeatureLicenseStatusMap(
          snapshot.featureLicenseStatus,
          revealSerials
        ),
        licenseType: license?.licenseType ?? null,
        serialNumber: revealSerials ? license?.serialNumber ?? null : null,
        expirationDate: license?.expirationDate ?? null,
        lastChecked: new Date().toISOString(),
      });
    }

    return { status: 200, body: { success: true, dbAvailable: true, statuses, serialsRevealed: revealSerials } };
  } catch (error) {
    return authErrorResult(error);
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

