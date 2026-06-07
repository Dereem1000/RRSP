import { NextRequest, NextResponse } from 'next/server';
import { Op } from 'sequelize';
import { SecurityEvent } from '@cd-v2/database';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { searchParams } = req.nextUrl;
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)));
    const severity = searchParams.get('severity');
    const eventType = searchParams.get('eventType');

    const where: Record<string, unknown> = { isActive: true };
    if (severity) where.severity = severity;
    if (eventType) where.eventType = eventType;

    const events = await SecurityEvent.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
    });

    return NextResponse.json({
      success: true,
      events: events.map((e) => {
        const j = e.toJSON() as SecurityEvent & { created_at?: Date };
        return {
          id: j.id,
          eventType: j.eventType,
          severity: j.severity,
          description: j.description,
          outcome: j.outcome,
          userId: j.userId,
          createdAt: j.created_at ? String(j.created_at) : '',
        };
      }),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
