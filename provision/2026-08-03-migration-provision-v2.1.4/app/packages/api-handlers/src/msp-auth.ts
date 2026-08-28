import type { ApiContext } from './types';
import { SystemConfig } from '@cd-v2/database';
import { verifyToken } from './jwt';
import { AuthError } from './auth';

async function getMspSyncToken(): Promise<string | null> {
  const dbToken = await SystemConfig.getConfig<string>('msp_api_token', null);
  if (dbToken?.trim()) return dbToken.trim();
  return process.env.MSP_API_TOKEN?.trim() || process.env.LICENSE_API_KEY?.trim() || null;
}

/** Session cookie auth OR Bearer token for license activation GUI / Python sync */
export async function requireMspApiAuth(
  ctx: ApiContext
): Promise<{ type: 'session' | 'token'; id?: number; role?: string }> {
  const apiToken = await getMspSyncToken();
  const authHeader = ctx.header('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);

    if (apiToken && token === apiToken) return { type: 'token' };

    const bearerSession = verifyToken(token);
    if (bearerSession && (bearerSession.role === 'admin' || bearerSession.role === 'technician')) {
      return { type: 'session', id: bearerSession.id, role: bearerSession.role };
    }
  }

  const cookieHeader = ctx.header('cookie');
  if (cookieHeader) {
    for (const part of cookieHeader.split(';')) {
      const [rawKey, ...rest] = part.trim().split('=');
      if (rawKey?.trim() === 'cd_access_token') {
        const cookieToken = decodeURIComponent(rest.join('=').trim());
        if (cookieToken) {
          const session = verifyToken(cookieToken);
          if (session && (session.role === 'admin' || session.role === 'technician')) {
            return { type: 'session', id: session.id, role: session.role };
          }
        }
      }
    }
  }

  throw new AuthError('Unauthorized', 401);
}

export function mspAuthErrorResult(error: unknown): { status: number; body: unknown } {
  const message = error instanceof Error ? error.message : 'Unauthorized';
  return {
    status: message === 'Unauthorized' ? 401 : 403,
    body: { success: false, message },
  };
}
