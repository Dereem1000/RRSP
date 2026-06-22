import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getMiniDockSettings, isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';

export async function GET(req: NextRequest) {
  try {
    requireSession(req);
    const active = await isMiniDockActive();
    if (!active) {
      return NextResponse.json({ success: true, active: false, online: false, settings: await getMiniDockSettings() });
    }
    const settings = await getMiniDockSettings();
    const result = await miniProxyRequest('/api/health', { method: 'GET' });
    return NextResponse.json({
      success: true,
      active: true,
      online: result.ok,
      settings: {
        docked: settings.docked,
        localUrl: settings.localUrl,
        publicUrl: settings.publicUrl,
        connected: settings.connected,
        lastSeenAt: settings.lastSeenAt,
        lastError: settings.lastError,
      },
      health: result.body,
    }, { status: 200 });
  } catch (error) {
    return authErrorResponse(error);
  }
}
