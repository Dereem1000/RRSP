import type { TokenPayload } from '@/lib/jwt';
import { isMiniDockConfigured, MINI_CD_EVENT_PROXY_TIMEOUT_MS, miniProxyRequest } from '@/lib/mini-dock';
import { buildMiniCdEvent, type MiniCdEvent } from '@/lib/mini-cd-events';

export async function emitMiniCdEvents(events: MiniCdEvent[]): Promise<void> {
  if (!events.length) return;
  if (!(await isMiniDockConfigured())) return;

  void miniProxyRequest(
    '/api/cd/events',
    {
      method: 'POST',
      body: JSON.stringify({
        source: 'computer-dynamics',
        events,
      }),
    },
    { timeoutMs: MINI_CD_EVENT_PROXY_TIMEOUT_MS, updateOnlineCache: false },
  ).catch(() => {
    /* learning is best-effort */
  });
}

export function emitMiniCdEvent(session: TokenPayload, event: Omit<MiniCdEvent, 'actor'> & { actorName?: string }) {
  void emitMiniCdEvents([buildMiniCdEvent(session, event)]);
}
