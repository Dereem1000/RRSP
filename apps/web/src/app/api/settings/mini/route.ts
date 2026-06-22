import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getMiniDockSettings, probeMiniHealth, saveMiniDockSettings } from '@/lib/mini-dock';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const settings = await getMiniDockSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const body = await req.json();
    const result = await saveMiniDockSettings({
      docked: Boolean(body.docked),
      installPath: String(body.installPath ?? ''),
      localUrl: body.localUrl ? String(body.localUrl) : undefined,
      publicUrl: body.publicUrl ? String(body.publicUrl) : undefined,
      startWithCd: body.startWithCd !== false,
      port: body.port ? Number(body.port) : undefined,
      regenerateToken: Boolean(body.regenerateToken),
      apiToken: body.apiToken ? String(body.apiToken) : undefined,
    });
    return NextResponse.json({
      success: true,
      settings: result.settings,
      apiToken: result.apiToken,
      message: result.settings.docked ? 'Mini dock settings saved' : 'Mini dock settings cleared',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save Mini settings';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');
    const body = await req.json().catch(() => ({}));
    if (body.action === 'test') {
      const probe = await probeMiniHealth();
      return NextResponse.json({ success: probe.ok, probe });
    }
    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
