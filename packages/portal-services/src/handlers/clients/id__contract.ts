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
import { serializeClient } from '@web/lib/clients';
import { SERVICE_LEVELS } from '@web/lib/client-constants';


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

    const { id } = ctx.params;
    const client = await Client.findByPk(id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client not found' } };
    }

    const body = ctx.body as Record<string, unknown>;
    const serviceLevel = body.serviceLevel as string;
    if (serviceLevel && !SERVICE_LEVELS.includes(serviceLevel as (typeof SERVICE_LEVELS)[number])) {
      return { status: 400, body: { success: false, message: 'Invalid service level' } };
    }

    const contractDetails = {
      ...(client.contractDetails as Record<string, unknown>),
      contractType: body.contractType ?? body.billingCycle ?? 'monthly',
      terms: body.terms ?? body.contractTerms ?? null,
    };

    const servicePlanData = {
      ...(client.servicePlanData as Record<string, unknown>),
      billingCycle: body.billingCycle ?? body.contractType ?? 'monthly',
      planName: body.planName ?? serviceLevel ?? client.serviceLevel,
      autoRenew: body.autoRenew ?? true,
    };

    await client.update({
      contractStartDate: body.startDate ?? body.contractStartDate ?? client.contractStartDate,
      contractEndDate: body.endDate ?? body.contractEndDate ?? client.contractEndDate,
      serviceLevel: (serviceLevel || client.serviceLevel) as Client['serviceLevel'],
      monthlyRate: body.monthlyRate != null ? Number(body.monthlyRate) : client.monthlyRate,
      contractDetails,
      servicePlanData,
    });

    const refreshed = await Client.findByPk(id);
    return { status: 200, body: {
      success: true,
      message: 'Contract updated',
      client: serializeClient(refreshed ?? client),
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

