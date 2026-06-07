import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getActiveLicenses, isLicenseDbAvailable } from '@/lib/license-service';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    if (!isLicenseDbAvailable()) {
      return NextResponse.json({ success: true, activeLicenses: [], totalActiveLicenses: 0 });
    }

    const activeLicenses = await getActiveLicenses();
    return NextResponse.json({
      success: true,
      activeLicenses,
      totalActiveLicenses: activeLicenses.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
