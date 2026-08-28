import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import { verifyToken, type TokenPayload } from './jwt';

export function getTokenFromRequest(req: NextRequest): string | null {
  const header = req.headers.get('authorization');
  if (header?.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim();
    if (bearer && verifyToken(bearer)) return bearer;
  }
  return req.cookies.get('cd_access_token')?.value ?? null;
}

export async function getSession(): Promise<TokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('cd_access_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function requireSession(req: NextRequest): TokenPayload {
  const token = getTokenFromRequest(req);
  if (!token) throw new AuthError('Authentication required', 401);
  const payload = verifyToken(token);
  if (!payload) throw new AuthError('Invalid or expired token', 401);
  return payload;
}

export function requireRole(session: TokenPayload, ...roles: string[]): void {
  if (!roles.includes(session.role)) {
    throw new AuthError('Insufficient permissions', 403);
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return Response.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error(error);
  return Response.json({ success: false, message: 'Internal server error' }, { status: 500 });
}
