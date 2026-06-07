import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getAccountingAnalytics } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');
    const analytics = await getAccountingAnalytics();
    return NextResponse.json({ success: true, analytics });
  } catch (error) {
    console.error('[ACCOUNTING ANALYTICS]', error);
    return authErrorResponse(error);
  }
}
