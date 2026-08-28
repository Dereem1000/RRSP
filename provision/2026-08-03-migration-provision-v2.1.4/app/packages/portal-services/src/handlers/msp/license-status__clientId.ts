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

import { Client } from '@web/lib/db';
import { getActivationFeatures } from '@web/lib/license-constants';
import { licenseSerialsRevealedFromCtx } from '../../http-helpers';
import { redactFeatureLicenseStatusMap } from '@web/lib/license-serial-privacy';
import { getClientLicenseSnapshot, getLicenseDbPathForDisplay } from '@web/lib/license-service';


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
    requireRole(session, 'admin', 'technician', 'client');

    const { clientId } = ctx.params;
    const client = await Client.findByPk(clientId);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    if (session.role === 'client') {
      const linked = await Client.findOne({ where: { userId: session.id } });
      if (!linked || linked.id !== clientId) {
        return { status: 403, body: { success: false, message: 'Access denied' } };
      }
    }

    if (getActivationFeatures(client.features).length === 0) {
      return { status: 200, body: {
        success: true,
        clientId,
        clientName: client.name,
        hasLicense: false,
        licenseStatus: 'Not Applicable',
        source: 'license_system',
        features: [],
        activationFeatures: [],
        dbAvailable: true,
      } };
    }

    const snapshot = await getClientLicenseSnapshot(clientId);
    const staffView = session.role === 'admin' || session.role === 'technician';
    const revealSerials = staffView ? licenseSerialsRevealedFromCtx(ctx, session.id) : false;

    if (!snapshot.dbAvailable) {
      return { status: 200, body: {
        success: true,
        clientId,
        clientName: client.name,
        hasLicense: false,
        licenseStatus: 'Database Unavailable',
        source: 'license_system',
        dbAvailable: false,
        dbPath: snapshot.dbPath ?? getLicenseDbPathForDisplay(),
        activationFeatures: getActivationFeatures(client.features),
      } };
    }

    const { license } = snapshot;
    const statusLabel =
      snapshot.overallStatus === 'Partial'
        ? 'Partially active'
        : snapshot.overallStatus;

    const featureLicenseStatus = staffView
      ? redactFeatureLicenseStatusMap(snapshot.featureLicenseStatus, revealSerials)
      : redactFeatureLicenseStatusMap(snapshot.featureLicenseStatus, false);

    return { status: 200, body: {
      success: true,
      clientId,
      clientName: client.companyName || client.name,
      serviceLevel: client.serviceLevel,
      source: 'license_system',
      hasLicense: snapshot.hasActiveLicense,
      licenseStatus: statusLabel,
      overallStatus: snapshot.overallStatus,
      features: snapshot.activationFeatures,
      activationFeatures: snapshot.activationFeatures,
      featureLicenseStatus,
      licenseType: license?.licenseType ?? null,
      maxUsers: license?.maxUsers ?? null,
      expirationDate: license?.expirationDate ?? null,
      serialNumber: revealSerials ? license?.serialNumber ?? null : null,
      serialsRevealed: revealSerials,
      dbAvailable: true,
      lastChecked: new Date().toISOString(),
      message:
        snapshot.overallStatus === 'Active'
          ? 'All licensed systems are active'
          : snapshot.overallStatus === 'Partial'
            ? 'Some systems active, others pending'
            : snapshot.overallStatus === 'Pending'
              ? 'Licenses exist but need activation'
              : 'No licenses in activation system — sync from client form',
    } };
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

