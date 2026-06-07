import { NextRequest, NextResponse } from 'next/server';
import { getFileIntegrityReport, rebaselineProtectedFiles } from '@cd-v2/security';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const report = await getFileIntegrityReport();
    return NextResponse.json({ success: true, report });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    if (session.clearance !== 'S-CLS1') {
      return NextResponse.json(
        { success: false, message: 'Only S-CLS1 can refresh file baselines' },
        { status: 403 }
      );
    }

    const report = await rebaselineProtectedFiles();
    return NextResponse.json({
      success: true,
      message: 'File integrity baselines refreshed',
      report,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
