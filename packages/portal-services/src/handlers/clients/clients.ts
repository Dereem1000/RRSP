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

import { Op } from 'sequelize';
import { Client, Ticket } from '@web/lib/db';
import {
  buildDefaultUsageTracking,
  buildUsageInfo,
  createPortalUserForClient,
  forceDeleteClient,
  getClientById,
  mergeUsageLimitsForServiceLevel,
  resolveUniqueEmail,
  sendPortalWelcomeEmail,
  serializeClient,
  validateTechnicianAssignment,
} from '@web/lib/clients';
import { getDefaultMonthlyRate, getDefaultSlaForLevel } from '@web/lib/client-constants';
import { pickClientFields } from '@web/lib/client-payload';
import { buildPortalUrl, getRequestPublicOrigin } from '@web/lib/site-url';
import { getRequestPublicOriginFromCtx } from '../../http-helpers';


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

    const searchParams = searchParamsFrom(ctx);
    const status = searchParams.get('status');
    const serviceLevel = searchParams.get('serviceLevel');
    const search = searchParams.get('search')?.trim();

    const where: Record<string, unknown> = {};
    if (status && status !== 'all') where.status = status;
    if (serviceLevel && serviceLevel !== 'all') {
      where.serviceLevel = serviceLevel === 'none' ? null : serviceLevel;
    }
    if (search) {
      Object.assign(where, {
        [Op.or]: [
          { name: { [Op.like]: `%${search}%` } },
          { companyName: { [Op.like]: `%${search}%` } },
          { contactPerson: { [Op.like]: `%${search}%` } },
          { email: { [Op.like]: `%${search}%` } },
          { phone: { [Op.like]: `%${search}%` } },
        ],
      });
    }

    const clients = await Client.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 500,
    });

    return { status: 200, body: {
      success: true,
      clients: clients.map(serializeClient),
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const body = ctx.body as Record<string, unknown>;
    const name = body.name?.trim();
    const email = body.email?.trim();

    if (!name || !email) {
      return { status: 400, body: { success: false, message: 'Name and email are required' } };
    }

    if (!(await resolveUniqueEmail(email))) {
      return { status: 400, body: { success: false, message: 'A client with this email already exists' } };
    }

    const serviceLevel = body.serviceLevel || null;
    const createPortalAccount = Boolean(body.createPortalAccount);
    let assignedTechnicianId: string | null = null;
    if (body.assignedTechnicianId) {
      assignedTechnicianId = await validateTechnicianAssignment(body.assignedTechnicianId);
    }

    let userId: number | undefined;
    let portalCredentials: { username: string; tempPassword: string; emailSent: boolean } | undefined;
    if (createPortalAccount) {
      const { user, tempPassword, username } = await createPortalUserForClient({
        email,
        name,
        contactPerson: body.contactPerson,
        phone: body.phone,
      });
      userId = user.id;
      const portalUrl = await buildPortalUrl(getRequestPublicOriginFromCtx(ctx));
      const emailSent =
        body.sendWelcomeEmail === true
          ? await sendPortalWelcomeEmail(
              { email, contactPerson: body.contactPerson },
              username,
              tempPassword,
              portalUrl
            )
          : false;
      portalCredentials = { username, tempPassword, emailSent };
    }

    const client = await Client.create({
      name,
      email,
      ...pickClientFields(body),
      assignedTechnicianId,
      serviceLevel: serviceLevel || null,
      supportTier: (body.supportTier as Client['supportTier']) || 'silver',
      status: (createPortalAccount ? 'pending' : body.status || 'active') as Client['status'],
      isActive: createPortalAccount ? false : body.isActive !== false,
      monthlyRate:
        body.monthlyRate != null && body.monthlyRate !== ''
          ? Number(body.monthlyRate)
          : getDefaultMonthlyRate(serviceLevel) ?? 0,
      usageTracking: body.usageTracking || buildDefaultUsageTracking(serviceLevel),
      billingInfo: body.billingInfo || {},
      contractDetails: body.contractDetails || {},
      servicePlanData: body.servicePlanData || {},
      slaAgreement: body.slaAgreement || (serviceLevel ? getDefaultSlaForLevel(serviceLevel) : {}),
      features: body.features || [],
      communicationHistory: [],
      userId,
    });

    const full = await Client.findByPk(client.id);
    return { status: 201, body: {
        success: true,
        client: serializeClient(full ?? client),
        portalCredentials,
        message: 'Client created',
      } };
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid technician assignment') {
      return { status: 400, body: { success: false, message: error.message } };
    }
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

