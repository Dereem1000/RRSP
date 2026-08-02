import { runWithRrspDb } from '@/lib/rrsp-db';

/** Run page/data loaders against the client's RRSP DB when gated. */
export async function withOptionalRrspDb<T>(
  gate: { mspClientId: string | null; rrsp: boolean },
  fn: () => Promise<T>
): Promise<T> {
  if (gate.rrsp && gate.mspClientId) {
    return runWithRrspDb(gate.mspClientId, fn);
  }
  return fn();
}
