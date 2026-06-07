import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { buildUsageInfo } from '@/lib/clients';
import { USAGE_TYPES } from '@/lib/client-constants';

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
    const type = (body.type as (typeof USAGE_TYPES)[number] | 'all') || 'all';
    const usage: Record<string, number | string> = { ...(client.usageTracking as Record<string, number>) };

    if (type === 'all') {
      usage.onsiteVisitsUsed = 0;
      usage.supportTicketsUsed = 0;
      usage.endpointsUsed = 0;
      usage.supportHoursUsed = 0;
    } else if (USAGE_TYPES.includes(type)) {
      usage[`${type}Used`] = 0;
    } else {
      return NextResponse.json({ success: false, message: 'Invalid usage type' }, { status: 400 });
    }

    usage.lastResetDate = new Date().toISOString();
    await client.update({ usageTracking: usage });

    return NextResponse.json({
      success: true,
      message: 'Usage counters reset',
      usage: buildUsageInfo(usage as Record<string, number>),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
