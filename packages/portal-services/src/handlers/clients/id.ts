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

import { Client, Ticket } from '@web/lib/db';
import {
  forceDeleteClient,
  getClientById,
  mergeUsageLimitsForServiceLevel,
  resolveUniqueEmail,
  serializeClient,
  validateTechnicianAssignment,
} from '@web/lib/clients';
import { pickClientFields } from '@web/lib/client-payload';
import { getDefaultMonthlyRate, getDefaultSlaForLevel } from '@web/lib/client-constants';


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

    const { id } = ctx.params;
    const client = await getClientById(id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    return { status: 200, body: { success: true, client: serializeClient(client) } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const client = await Client.findByPk(id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    if (body.email && body.email !== client.email) {
      if (!(await resolveUniqueEmail(body.email, id))) {
        return { status: 400, body: { success: false, message: 'Email already in use' } };
      }
    }

    const updates = pickClientFields(body);
    if (body.serviceLevel === '') updates.serviceLevel = null;

    if (body.assignedTechnicianId !== undefined) {
      updates.assignedTechnicianId = await validateTechnicianAssignment(body.assignedTechnicianId);
    }

    if (body.servicePlanData !== undefined) {
      updates.servicePlanData = {
        ...(client.servicePlanData as Record<string, unknown>),
        ...(body.servicePlanData as Record<string, unknown>),
      };
    }

    if (
      updates.serviceLevel !== undefined &&
      updates.serviceLevel !== client.serviceLevel
    ) {
      if (!body.usageTracking) {
        updates.usageTracking = mergeUsageLimitsForServiceLevel(
          client.usageTracking as Record<string, unknown>,
          updates.serviceLevel as string | null
        );
      }
      if (!body.slaAgreement) {
        updates.slaAgreement = getDefaultSlaForLevel(updates.serviceLevel as string | null);
      }
      if (body.monthlyRate === undefined) {
        const rate = getDefaultMonthlyRate(updates.serviceLevel as string | null);
        if (rate != null) updates.monthlyRate = rate;
      }
    }

    await client.update(updates);
    const refreshed = await getClientById(id);
    return { status: 200, body: { success: true, client: serializeClient(refreshed ?? client) } };
  } catch (error) {
    if (error instanceof Error && error.message === 'Invalid technician assignment') {
      return { status: 400, body: { success: false, message: error.message } };
    }
    return authErrorResult(error);
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const { id } = ctx.params;
    const client = await Client.findByPk(id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    const force = searchParamsFrom(ctx).get('force') === 'true';
    const ticketCount = await Ticket.count({ where: { clientId: id } });

    if (force) {
      const result = await forceDeleteClient(id);
      return { status: 200, body: {
        success: true,
        message: `Client permanently deleted${result.ticketCount ? ` along with ${result.ticketCount} tickets` : ''}.`,
      } };
    }

    if (ticketCount > 0) {
      return { status: 400, body: {
          success: false,
          message: `Client has ${ticketCount} associated tickets. Deactivate instead, or add ?force=true to delete everything.`,
          ticketCount,
        } };
    }

    await client.update({ isActive: false, status: 'inactive' });
    return { status: 200, body: { success: true, message: 'Client deactivated' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

