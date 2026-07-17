import type { TokenPayload } from '@/lib/jwt';

export type MiniCdEventActor = {
  id: number;
  name: string;
  role: string;
};

export type MiniCdEvent = {
  type: string;
  summary: string;
  entityType?: string;
  entityId?: string;
  href?: string;
  clientId?: string;
  clientName?: string;
  actor?: MiniCdEventActor;
  metadata?: Record<string, string | number | boolean | null>;
  occurredAt?: string;
};

function actorFromSession(session: TokenPayload, displayName?: string): MiniCdEventActor {
  return {
    id: session.id,
    role: session.role || 'client',
    name: displayName || session.username || `User ${session.id}`,
  };
}

export function buildMiniCdEvent(
  session: TokenPayload,
  event: Omit<MiniCdEvent, 'actor'> & { actorName?: string }
): MiniCdEvent {
  const { actorName, ...rest } = event;
  return {
    ...rest,
    occurredAt: rest.occurredAt || new Date().toISOString(),
    actor: actorFromSession(session, actorName),
  };
}

/** Client-safe emitter — proxies through CD API route (best-effort; never surfaces errors). */
export async function emitMiniCdEvents(events: MiniCdEvent[]): Promise<void> {
  if (!events.length || typeof window === 'undefined') return;

  void fetch('/api/mini/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    keepalive: true,
    signal: AbortSignal.timeout(9_000),
    body: JSON.stringify({
      source: 'computer-dynamics',
      events,
    }),
  }).catch(() => {
    /* learning is best-effort */
  });
}

export function emitMiniCdEvent(session: TokenPayload, event: Omit<MiniCdEvent, 'actor'> & { actorName?: string }) {
  void emitMiniCdEvents([buildMiniCdEvent(session, event)]);
}

export function emitMiniCdPageView(
  session: TokenPayload,
  options: { href: string; label: string; actorName?: string }
) {
  emitMiniCdEvent(session, {
    type: 'portal.page_view',
    summary: `Viewing ${options.label}`,
    href: options.href,
    metadata: { pageLabel: options.label },
    actorName: options.actorName,
  });
}
