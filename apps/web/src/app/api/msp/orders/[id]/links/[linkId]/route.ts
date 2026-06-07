import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { removeOrderLink } from '@/lib/orders';

type RouteParams = { params: Promise<{ id: string; linkId: string }> };

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin');

    const { id, linkId } = await params;
    await removeOrderLink(id, linkId);
    return NextResponse.json({ success: true, message: 'Link removed' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
