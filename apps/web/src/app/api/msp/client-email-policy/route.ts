import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getClientEmailPolicy } from '@/lib/settings';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');
    const policy = await getClientEmailPolicy();
    return NextResponse.json({ success: true, ...policy });
  } catch (error) {
    return authErrorResponse(error);
  }
}
