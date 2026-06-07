import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { buildUsageInfo } from '@/lib/clients';
import { USAGE_TYPES } from '@/lib/client-constants';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const client = await Client.findByPk(id);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const body = await req.json();
    const type = body.type as (typeof USAGE_TYPES)[number];
    const amount = Number(body.amount ?? 1);

    if (!USAGE_TYPES.includes(type)) {
      return NextResponse.json({ success: false, message: 'Invalid usage type' }, { status: 400 });
    }
    if (Number.isNaN(amount) || amount < 0) {
      return NextResponse.json({ success: false, message: 'Invalid amount' }, { status: 400 });
    }

    const usage = { ...(client.usageTracking as Record<string, number>) };
    const usedKey = `${type}Used`;
    const limitKey = `${type}Limit`;
    const currentUsed = Number(usage[usedKey] ?? 0);
    const limit = Number(usage[limitKey] ?? 0);

    if (limit > 0 && currentUsed + amount > limit) {
      return NextResponse.json(
        {
          success: false,
          message: `Usage limit exceeded. Current: ${currentUsed}, limit: ${limit}, requested: ${amount}`,
        },
        { status: 400 }
      );
    }

    usage[usedKey] = currentUsed + amount;
    await client.update({ usageTracking: usage });

    return NextResponse.json({
      success: true,
      message: `${type} usage updated`,
      usage: buildUsageInfo(usage),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
