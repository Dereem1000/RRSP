'use client';

import { CheckCircle2, XCircle } from 'lucide-react';
import type { EmailLogEntry } from '@/lib/email-log';

function formatLogTime(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function EmailSentHistory({ logs }: { logs: EmailLogEntry[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sent history</p>
      <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
        {logs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">No emails sent yet</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">{log.toEmail}</p>
                  <p className="truncate text-xs text-slate-500" title={log.subject}>
                    {log.subject}
                    {log.detail ? ` · ${log.detail}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">{formatLogTime(log.createdAt)}</p>
                </div>
                {log.status === 'sent' ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Sent
                  </span>
                ) : (
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-red-700"
                    title={log.errorMessage ?? undefined}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Failed
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
