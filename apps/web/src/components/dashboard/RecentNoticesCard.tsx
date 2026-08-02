'use client';

import { useEffect, useState } from 'react';
import { Bell, Pin } from 'lucide-react';

type Notice = {
  id: number;
  title: string;
  content: string;
  priority: string;
  category: string;
  isPinned: boolean;
  publishAt: string;
  scope?: 'shop' | 'support';
};

export function RecentNoticesCard({
  showScopeBadges = false,
}: {
  /** When true (RRSP hybrid clients), label each notice as Shop or Support. */
  showScopeBadges?: boolean;
}) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/notices')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setNotices(data.notices);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Bell className="h-5 w-5 text-indigo-600" />
        <h2 className="font-semibold text-slate-900">Recent notices</h2>
      </div>
      {showScopeBadges && (
        <p className="mt-1 text-xs text-slate-400">Shop and Computer Dynamics support</p>
      )}

      <div className="mt-4 space-y-3">
        {loading ? (
          <p className="text-sm text-slate-400">Loading notices…</p>
        ) : notices.length === 0 ? (
          <p className="text-sm text-slate-400">No notices posted</p>
        ) : (
          notices.map((notice) => (
            <div key={notice.id} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {showScopeBadges && (
                    <span
                      className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        notice.scope === 'shop'
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {notice.scope === 'shop' ? 'Shop' : 'Support'}
                    </span>
                  )}
                  <p className="font-medium text-slate-900">{notice.title}</p>
                </div>
                {notice.isPinned && <Pin className="h-4 w-4 shrink-0 text-amber-500" />}
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-slate-600">{notice.content}</p>
              <p className="mt-2 text-xs capitalize text-slate-400">
                {notice.category} · {notice.priority}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
