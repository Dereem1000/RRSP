'use client';

import { useEffect, useRef } from 'react';

const DEFAULT_BASE_MS = 60_000;
const DEFAULT_MAX_MS = 180_000;

/** Poll Mini-backed routes with backoff when the host is slow or offline. */
export function useAdaptiveMiniPoll(
  enabled: boolean,
  poll: () => boolean | Promise<boolean>,
  options?: { baseMs?: number; maxMs?: number },
) {
  const baseMs = options?.baseMs ?? DEFAULT_BASE_MS;
  const maxMs = options?.maxMs ?? DEFAULT_MAX_MS;
  const failsRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    const schedule = (delayMs: number) => {
      if (cancelled) return;
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        void tick();
      }, delayMs);
    };

    const tick = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.hidden) {
        schedule(baseMs);
        return;
      }

      let ok = false;
      try {
        ok = await poll();
      } catch {
        ok = false;
      }

      failsRef.current = ok ? 0 : Math.min(failsRef.current + 1, 4);
      const delay = Math.min(maxMs, baseMs * 2 ** failsRef.current);
      schedule(delay);
    };

    void tick();

    return () => {
      cancelled = true;
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [enabled, poll, baseMs, maxMs]);
}
