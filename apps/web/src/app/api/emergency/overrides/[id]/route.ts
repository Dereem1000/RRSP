import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { deleteEmergencyOverride } from '@cd-v2/security';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin');

    const { id } = await params;
    const ok = await deleteEmergencyOverride(id);
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Override not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Emergency override deleted' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
