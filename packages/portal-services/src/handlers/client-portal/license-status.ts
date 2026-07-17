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

import { Client, User } from '@web/lib/db';
import { getActivationFeatures } from '@web/lib/license-constants';
import { getClientLicenseSnapshot } from '@web/lib/license-service';
import { buildClientPortalLicensePayload } from '@web/lib/client-portal-license';

const NOT_APPLICABLE = {
  revealed: false,
  hasLicense: false,
  isActive: false,
  licenseStatus: 'Not Applicable',
  overallStatus: 'Inactive' as const,
  activationFeatures: [] as const,
  systems: [] as const,
  companyName: null as string | null,
  dbAvailable: true,
};

async function getLinkedClient(sessionId: number) {
  return Client.findOne({
    where: { userId: sessionId },
    attributes: ['id', 'name', 'companyName', 'email', 'features'],
  });
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    if (session.role !== 'client') {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const client = await getLinkedClient(session.id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    if (getActivationFeatures(client.features).length === 0) {
      return { status: 200, body: {
        success: true,
        licenseStatus: { ...NOT_APPLICABLE, source: 'license_system' },
      } };
    }

    const snapshot = await getClientLicenseSnapshot(client.id);
    const licenseStatus = buildClientPortalLicensePayload(
      snapshot,
      snapshot.license?.companyName ?? client.companyName ?? client.name,
      false
    );

    return { status: 200, body: { success: true, licenseStatus } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    if (session.role !== 'client') {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return { status: 400, body: { success: false, message: 'Password is required' } };
    }

    const user = await User.findByPk(session.id);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    const valid = await user.validatePassword(password);
    if (!valid) {
      return { status: 401, body: { success: false, message: 'Incorrect password' } };
    }

    const client = await getLinkedClient(session.id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    if (getActivationFeatures(client.features).length === 0) {
      return { status: 200, body: {
        success: true,
        licenseStatus: { ...NOT_APPLICABLE, source: 'license_system' },
      } };
    }

    const snapshot = await getClientLicenseSnapshot(client.id);
    const licenseStatus = buildClientPortalLicensePayload(
      snapshot,
      snapshot.license?.companyName ?? client.companyName ?? client.name,
      true
    );

    return { status: 200, body: { success: true, licenseStatus } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

