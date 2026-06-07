import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/jwt';

/** Session cookie auth OR Bearer token for license activation GUI / Python sync */
export function requireMspApiAuth(req: NextRequest): { type: 'session' | 'token'; id?: number; role?: string } {
  const apiToken = process.env.MSP_API_TOKEN || process.env.LICENSE_API_KEY;
  const authHeader = req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ') && apiToken) {
    const token = authHeader.slice(7);
    if (token === apiToken) return { type: 'token' };
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
