import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { getMspSyncToken } from '@/lib/msp-sync-token';

/** Session cookie auth OR Bearer token for license activation GUI / Python sync */
export async function requireMspApiAuth(
  req: NextRequest
): Promise<{ type: 'session' | 'token'; id?: number; role?: string }> {
  const apiToken = await getMspSyncToken();
  const authHeader = req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    if (apiToken && token === apiToken) return { type: 'token' };

    // Legacy license GUI stores an admin JWT as the MSP API token.
    const bearerSession = verifyToken(token);
    if (bearerSession && (bearerSession.role === 'admin' || bearerSession.role === 'technician')) {
      return { type: 'session', id: bearerSession.id, role: bearerSession.role };
    }
  }

  const cookieToken = req.cookies.get('cd_access_token')?.value;
  if (cookieToken) {
    const session = verifyToken(cookieToken);
    if (session && (session.role === 'admin' || session.role === 'technician')) {
      return { type: 'session', id: session.id, role: session.role };
    }
  }

  throw new Error('Unauthorized');
}

export function mspAuthErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unauthorized';
  return Response.json({ success: false, message }, { status: message === 'Unauthorized' ? 401 : 403 });
}
