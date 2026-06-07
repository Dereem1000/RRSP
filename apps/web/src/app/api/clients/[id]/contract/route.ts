import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { serializeClient } from '@/lib/clients';
import { SERVICE_LEVELS } from '@/lib/client-constants';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const client = await Client.findByPk(id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const body = await req.json();
    const serviceLevel = body.serviceLevel as string;
    if (serviceLevel && !SERVICE_LEVELS.includes(serviceLevel as (typeof SERVICE_LEVELS)[number])) {
      return NextResponse.json({ success: false, message: 'Invalid service level' }, { status: 400 });
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
    return NextResponse.json({
      success: true,
      message: 'Contract updated',
      client: serializeClient(refreshed ?? client),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
