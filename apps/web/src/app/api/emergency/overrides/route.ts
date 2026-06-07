import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { listEmergencyOverrides } from '@cd-v2/security';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { searchParams } = req.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 10);

    const result = await listEmergencyOverrides({ page, limit });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}
