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
import { syncClientToLicenseSystem, clientHasActivationFeatures } from '@web/lib/license-sync';
import { isLicenseDbAvailable, getLicenseDbPathForDisplay } from '@web/lib/license-service';
import { activateLicense } from '@web/lib/license-service';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { clientId } = ctx.params;
    const client = await Client.findByPk(clientId);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    if (!isLicenseDbAvailable()) {
      return { status: 503, body: {
          success: false,
          message: `License database not found. Configure LICENSE_DB_PATH (expected: ${getLicenseDbPathForDisplay()})`,
        } };
    }

    if (!clientHasActivationFeatures(client)) {
      return { status: 400, body: { success: false, message: 'Select at least one activation feature before syncing' } };
    }

    const result = await syncClientToLicenseSystem(client);
    return { status: 200, body: result };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { clientId } = ctx.params;
    const body = ctx.body as Record<string, unknown>;
    const licenseId = Number(body.licenseId);

    if (!licenseId) {
      return { status: 400, body: { success: false, message: 'licenseId is required' } };
    }

    if (!isLicenseDbAvailable()) {
      return { status: 503, body: { success: false, message: 'License database unavailable' } };
    }

    await activateLicense(licenseId);
    return { status: 200, body: { success: true, message: 'License activated' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

