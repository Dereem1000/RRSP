'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function RrspStaffLoginUrl({ shopLoginSlug }: { shopLoginSlug: string }) {
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/login/shop/${encodeURIComponent(shopLoginSlug)}`);
  }, [shopLoginSlug]);

  async function copyUrl() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }

  if (!shopLoginSlug) return null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3">
      <p className="text-xs font-medium text-indigo-950">Staff sign-in page</p>
      <p className="mt-1 text-xs leading-relaxed text-indigo-900/80">
        Share this link with your team — it shows your shop branding, not Computer Dynamics.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border border-indigo-200/80 bg-white px-2.5 py-1.5 text-xs text-slate-800">
          {url || `/login/shop/${shopLoginSlug}`}
        </code>
        <button
          type="button"
          onClick={copyUrl}
          disabled={!url}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2.5 py-1.5 text-xs font-medium text-indigo-900 transition hover:bg-indigo-50 disabled:opacity-50"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
