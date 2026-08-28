import type { ApiContext, TokenPayload } from './types';
import { COOKIE_NAME, verifyToken } from './jwt';

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
  }
}

export function getTokenFromContext(ctx: ApiContext): string | null {
  const header = ctx.header('authorization');
  if (header?.startsWith('Bearer ')) {
    const bearer = header.slice(7).trim();
    if (bearer && verifyToken(bearer)) return bearer;
  }

  const cookieHeader = ctx.header('cookie');
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey?.trim() === COOKIE_NAME) {
        const value = rest.join('=').trim();
        if (value) return decodeURIComponent(value);
      }
    }
  }

  const fromParsed = ctx.cookies?.[COOKIE_NAME];
  if (fromParsed) return decodeURIComponent(fromParsed);

  return null;
}

export function requireSession(ctx: ApiContext): TokenPayload {
  if (ctx.session) return ctx.session;

  const token = getTokenFromContext(ctx);
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

export function requireAdmin(ctx: ApiContext): TokenPayload {
  const session = requireSession(ctx);
  requireRole(session, 'admin');
  return session;
}

export function authErrorResult(error: unknown): { status: number; body: unknown } {
  if (error instanceof AuthError) {
    return { status: error.status, body: { success: false, message: error.message } };
  }
  console.error(error);
  return { status: 500, body: { success: false, message: 'Internal server error' } };
}
