import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getRecentNotices } from '@/lib/notices';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician', 'client');

    let clientId: string | null = null;
    if (session.role === 'client') {
      const client = await Client.findOne({ where: { userId: session.id } });
      clientId = client?.id ?? null;
    }

    const notices = await getRecentNotices(session.role, 8, {
      userId: session.id,
      clientId,
    });
    return NextResponse.json({
      success: true,
      notices: notices.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        priority: n.priority,
        category: n.category,
        isPinned: n.isPinned,
        publishAt: n.publishAt,
      })),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
