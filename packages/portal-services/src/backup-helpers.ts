import { isBackupEnabled } from '@cd-v2/backup';
import type { ApiContext, TokenPayload } from '@cd-v2/api-handlers';
import { AuthError, requireRole, requireSession } from '@cd-v2/api-handlers';
import { applyRequestGuardFromCtx } from './http-helpers';

export async function requireBackupAdmin(ctx: ApiContext): Promise<TokenPayload> {
  const guardRes = await applyRequestGuardFromCtx(ctx);
  if (guardRes) throw new AuthError('Request blocked', guardRes.status);

  const session = requireSession(ctx);
  requireRole(session, 'admin');
  const enabled = await isBackupEnabled();
  if (!enabled) {
    throw new AuthError('Backup system is disabled', 503);
  }
  return session;
}

export { requireCls1ForFullRestore } from '@web/lib/backup-api';
