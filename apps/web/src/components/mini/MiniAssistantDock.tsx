'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bot, Loader2, MessageSquare, X } from 'lucide-react';
import {
  companionBubbleClass,
  companionKindBadgeClass,
  companionKindLabel,
  type MiniChatEntry,
  type MiniGrowthPayload,
} from '@/lib/mini-companion-ui';
import { type MiniPortalAction } from '@/lib/mini-portal-actions';
import { emitMiniCdPageView } from '@/lib/mini-cd-events';
import { useAdaptiveMiniPoll } from '@/lib/use-adaptive-mini-poll';
import { apiErrorMessage, parseFetchJsonResponse } from '@/lib/parse-fetch-json';

type FeedPayload = {
  chat_history?: MiniChatEntry[];
  system_notifications?: Array<{
    title: string;
    message: string;
    level?: string;
    created_at?: string | null;
    read?: boolean;
    source?: string;
    kind?: string;
  }>;
  growth?: MiniGrowthPayload;
  unread_notification_count?: number;
  unread_companion_count?: number;
};

type FeedItem =
  | {
      kind: 'chat';
      role: string;
      content: string;
      created_at?: string | null;
      companionKind?: string;
      read?: boolean;
      key: string;
    }
  | {
      kind: 'notice';
      title: string;
      message: string;
      level?: string;
      created_at?: string | null;
      read?: boolean;
      key: string;
    };

function feedSortTime(value: string | null | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function buildFeedItems(feed: FeedPayload | null, limit = 14): FeedItem[] {
  const chat = feed?.chat_history || [];
  const notices = feed?.system_notifications || [];
  const items: FeedItem[] = [
    ...chat.map((entry, index) => ({
      kind: 'chat' as const,
      role: entry.role,
      content: entry.content,
      created_at: entry.created_at,
      companionKind: entry.kind,
      read: entry.read,
      key: `chat-${entry.fingerprint || index}-${entry.role}-${entry.content.slice(0, 24)}`,
    })),
    ...notices
      .filter((notice) => notice.source !== 'mini_companion')
      .map((notice, index) => ({
        kind: 'notice' as const,
        title: notice.title,
        message: notice.message,
        level: notice.level,
        created_at: notice.created_at,
        read: notice.read,
        key: `notice-${index}-${notice.title}`,
      })),
  ];
  return items
    .map((item, index) => ({
      item,
      sortTime: feedSortTime(item.created_at, chat.length + notices.length - index),
    }))
    .sort((left, right) => right.sortTime - left.sortTime)
    .slice(0, limit)
    .map(({ item }) => item);
}

export function MiniAssistantDock({
  enabled,
  sidebarWidth = 72,
  page = '/dashboard',
  pageLabel,
  userId,
  userRole = 'admin',
  userName,
}: {
  enabled: boolean;
  sidebarWidth?: number;
  page?: string;
  pageLabel?: string;
  userId?: number;
  userRole?: string;
  userName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [feed, setFeed] = useState<FeedPayload | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingUserMessages, setPendingUserMessages] = useState<MiniChatEntry[]>([]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const href = page || '/dashboard';
    const label = pageLabel || 'Portal';
    const timer = window.setTimeout(() => {
      emitMiniCdPageView(
        { id: userId, role: userRole, username: userName, clearance: 'standard' },
        { href, label, actorName: userName }
      );
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [enabled, page, pageLabel, userId, userRole, userName]);

  const loadFeed = useCallback(async (): Promise<boolean> => {
    if (!enabled) return true;
    try {
      const res = await fetch('/api/mini/chat-feed', { cache: 'no-store', credentials: 'include' });
      if (res.status === 503 || res.status === 502 || res.status === 504 || res.status === 524) return false;
      if (!res.ok) return false;
      const data = await parseFetchJsonResponse<FeedPayload>(res);
      setFeed(data);
      return true;
    } catch {
      return false;
    }
  }, [enabled]);

  const ackNotifications = useCallback(async () => {
    if (!enabled) return;
    try {
      const res = await fetch('/api/mini/chat-notifications/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({}),
      });
      if (res.status === 503) return;
      const data = await parseFetchJsonResponse<{ chat_feed?: FeedPayload }>(res);
      if (res.ok && data.chat_feed) {
        setFeed(data.chat_feed);
        return;
      }
      await loadFeed();
    } catch {
      /* badge may refresh on next poll */
    }
  }, [enabled, loadFeed]);

  useAdaptiveMiniPoll(enabled && open, loadFeed, { baseMs: 45_000, maxMs: 120_000 });

  useEffect(() => {
    if (!open || !enabled) return;
    void ackNotifications();
  }, [open, enabled, ackNotifications]);

  const applyPortalAction = useCallback(
    (action: MiniPortalAction | null | undefined) => {
      if (!action || action.type !== 'navigate' || !action.href) return;
      router.push(action.href);
    },
    [router]
  );

  async function sendMessage() {
    const text = message.trim();
    if (!text || busy) return;
    const optimisticEntry: MiniChatEntry = {
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setPendingUserMessages((prev) => [...prev, optimisticEntry]);
    setMessage('');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/mini/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          page,
          pageLabel,
        }),
      });
      const data = await parseFetchJsonResponse<{
        error?: string;
        message?: string;
        portal_action?: MiniPortalAction | null;
      }>(res);
      if (!res.ok) throw new Error(apiErrorMessage(data, 'Chat failed'));
      applyPortalAction(data.portal_action as MiniPortalAction | null | undefined);
      await loadFeed();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chat failed');
    } finally {
      setPendingUserMessages([]);
      setBusy(false);
    }
  }

  const alertCount = feed?.unread_notification_count ?? 0;
  const feedItems = useMemo(() => {
    if (!pendingUserMessages.length) return buildFeedItems(feed);
    return buildFeedItems({
      ...feed,
      chat_history: [...(feed?.chat_history || []), ...pendingUserMessages],
    });
  }, [feed, pendingUserMessages]);
  const growth = feed?.growth;

  if (!enabled) return null;

  const dockInset = { left: sidebarWidth + 24 };

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open Mini companion"
          style={dockInset}
          className="fixed bottom-6 z-40 flex items-center gap-2 rounded-full border border-fuchsia-200 bg-white px-4 py-2.5 text-sm font-semibold text-fuchsia-950 shadow-lg transition-[left,background-color] duration-200 ease-out hover:bg-fuchsia-50"
        >
          <Bot className="h-5 w-5 text-fuchsia-700" />
          <span className="hidden sm:inline">Mini</span>
          {alertCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold text-white">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>
      )}

      {open && (
        <aside
          style={dockInset}
          className="fixed bottom-6 z-40 flex w-[min(24rem,calc(100vw-2rem))] flex-col rounded-2xl border border-fuchsia-200 bg-white shadow-2xl transition-[left] duration-200 ease-out"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-fuchsia-700" />
              <div>
                <p className="text-sm font-semibold text-slate-900">Mini companion</p>
                <p className="text-xs text-slate-500">
                  {growth?.maturity ? growth.maturity.replace(/-/g, ' ') : 'Connected to docked Mini'}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Mini companion">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>

          {growth?.narrative ? (
            <p className="border-b border-slate-100 px-4 py-2 text-[11px] leading-relaxed text-slate-600">
              {growth.narrative}
            </p>
          ) : null}

          <div className="max-h-72 space-y-2 overflow-y-auto px-4 py-3">
            {feedItems.map((item) =>
              item.kind === 'notice' ? (
                <div
                  key={item.key}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    item.read
                      ? 'border-slate-200 bg-slate-50 text-slate-600 opacity-80'
                      : item.level === 'error'
                        ? 'border-red-200 bg-red-50 text-red-900'
                        : item.level === 'warning'
                          ? 'border-amber-200 bg-amber-50 text-amber-950'
                          : 'border-sky-200 bg-sky-50 text-sky-950'
                  }`}
                >
                  <p className="font-semibold">{item.title}</p>
                  {item.read ? <p className="mb-1 text-[10px] uppercase tracking-wide opacity-50">Read</p> : null}
                  <p className="mt-1 whitespace-pre-wrap opacity-90">{item.message}</p>
                </div>
              ) : (
                <div
                  key={item.key}
                  className={`rounded-xl px-3 py-2 text-xs ${companionBubbleClass(item.role, item.companionKind)} ${
                    item.read ? 'opacity-75' : ''
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="font-semibold">
                      {item.role === 'companion'
                        ? companionKindLabel(item.companionKind)
                        : item.role}
                    </p>
                    {item.role === 'companion' && item.companionKind ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${companionKindBadgeClass(item.companionKind)}`}
                      >
                        {item.companionKind}
                      </span>
                    ) : null}
                  </div>
                  <p className="whitespace-pre-wrap">{item.content}</p>
                </div>
              )
            )}
            {feedItems.length === 0 && (
              <p className="text-xs text-slate-500">
                Mini will share thoughts here while she runs. Ask her how she&apos;s growing or what she needs.
              </p>
            )}
          </div>

          {error && <p className="px-4 text-xs text-red-600">{error}</p>}

          <div className="border-t border-slate-100 p-4">
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Talk to Mini…"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-fuchsia-500 focus:ring-2 focus:ring-fuchsia-500/20"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={busy || !message.trim()}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-fuchsia-700 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-800 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Send
            </button>
          </div>
        </aside>
      )}
    </>
  );
}
