import { NextRequest } from 'next/server';
import { isBackupEnabled } from '@cd-v2/backup';
import { authErrorResponse, AuthError, requireRole, requireSession } from '@/lib/auth';
import type { TokenPayload } from '@/lib/jwt';
import { applyRequestGuard } from '@/lib/with-security';

export async function requireBackupAdmin(req: NextRequest): Promise<TokenPayload> {
  const guardRes = await applyRequestGuard(req);
  if (guardRes) throw new AuthError('Request blocked', guardRes.status);

  const session = requireSession(req);
  requireRole(session, 'admin');
  const enabled = await isBackupEnabled();
  if (!enabled) {
    throw new AuthError('Backup system is disabled', 503);
  }
  return session;
}

export function requireCls1ForFullRestore(session: TokenPayload, restoreType: string, overwrite?: boolean) {
  if (restoreType === 'full' || restoreType === 'license' || overwrite) {
    if (session.clearance !== 'S-CLS1') {
      throw new AuthError('S-CLS1 clearance required for full restore or overwrite', 403);
    }
  }
}

export { authErrorResponse };
