import { getClientRrspAccess } from '@/lib/rrsp-access';
import { isRrspDbActive, runWithRrspDb } from '@/lib/rrsp-db';

export type PosMode = 'cd' | 'rrsp';

/**
 * Resolve POS mode and ensure shop DB ALS is active for RRSP clients.
 * Self-heals when the Express dispatcher did not wrap /api/rrsp|/api/pos.
 */
export async function runWithPosAccess<T>(
  session: { id: number; role: string },
  fn: (mode: PosMode) => Promise<T>
): Promise<T> {
  if (session.role === 'admin' || session.role === 'technician') {
    return fn(isRrspDbActive() ? 'rrsp' : 'cd');
  }

  if (session.role === 'client') {
    const access = await getClientRrspAccess(session.id);
    if (!access.enabled || !access.mspClientId) {
      throw Object.assign(new Error('Shop POS requires an active RRSP license'), { status: 403 });
    }
    if (!access.modules.includes('pos')) {
      throw Object.assign(new Error('Shop POS module is not enabled'), { status: 403 });
    }
    if (isRrspDbActive()) return fn('rrsp');
    return runWithRrspDb(access.mspClientId, () => fn('rrsp'));
  }

  throw Object.assign(new Error('Access denied'), { status: 403 });
}
