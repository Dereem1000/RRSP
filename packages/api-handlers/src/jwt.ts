import jwt, { type SignOptions } from 'jsonwebtoken';
import type { TokenPayload } from './types';

const WEAK_JWT_SECRETS = new Set([
  '',
  'supersecretkey',
  'your-secret-key-here',
  'your-secret-key-change-in-production',
  'changeme',
  'secret',
]);

export function resolveJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim() || '';
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret || WEAK_JWT_SECRETS.has(secret)) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET must be set to a strong random value in production. Update .env before running npm run start.'
      );
    }
    return 'supersecretkey';
  }

  if (isProduction && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }

  return secret;
}

const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '24h') as SignOptions['expiresIn'];

function jwtSecret(): string {
  return resolveJwtSecret();
}

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, jwtSecret(), { expiresIn: JWT_EXPIRES_IN });
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

/** Express `res.cookie` maxAge is in milliseconds (Next.js uses seconds). */
export const SESSION_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
