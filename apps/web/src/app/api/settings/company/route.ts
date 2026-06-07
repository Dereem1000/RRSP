import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getCompanySettings, saveCompanySettings } from '@/lib/company-settings';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const company = await getCompanySettings();
    return NextResponse.json({ success: true, company });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const body = await req.json();
    await saveCompanySettings(body);
    const company = await getCompanySettings();
    return NextResponse.json({ success: true, message: 'Company settings saved', company });
  } catch (error) {
    return authErrorResponse(error);
  }
}
