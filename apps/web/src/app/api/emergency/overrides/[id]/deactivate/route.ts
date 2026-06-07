import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { deactivateEmergencyOverride } from '@cd-v2/security';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin');

    const { id } = await params;
    const override = await deactivateEmergencyOverride(id);
    if (!override) {
      return NextResponse.json({ success: false, message: 'Override not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'Emergency override deactivated',
      override,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
