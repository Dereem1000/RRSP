import jwt, { type SignOptions } from 'jsonwebtoken';
import { resolveJwtSecret } from '@/lib/env-secrets';

const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '24h') as SignOptions['expiresIn'];
const JWT_REFRESH_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN || '7d') as SignOptions['expiresIn'];

function jwtSecret(): string {
  return resolveJwtSecret();
}

export interface TokenPayload {
  id: number;
  role: string;
  clearance?: string;
  username?: string;
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: JWT_EXPIRES_IN });
}

export function signRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const payload = jwt.verify(token, jwtSecret()) as Record<string, unknown>;
    if (typeof payload.id !== 'number' || typeof payload.role !== 'string') {
      return null;
    }
    return {
      id: payload.id,
      role: payload.role,
      clearance: typeof payload.clearance === 'string' ? payload.clearance : undefined,
      username: typeof payload.username === 'string' ? payload.username : undefined,
    };
  } catch {
    return null;
  }
}

export const COOKIE_NAME = 'cd_access_token';
