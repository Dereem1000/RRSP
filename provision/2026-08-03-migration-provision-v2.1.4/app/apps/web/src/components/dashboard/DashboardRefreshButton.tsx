'use client';

import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

export function DashboardRefreshButton() {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.refresh()}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <RefreshCw className="h-4 w-4" />
      Refresh
    </button>
  );
}
