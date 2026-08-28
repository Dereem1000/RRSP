'use client';

import { useEffect, useState } from 'react';
import { FileText, Loader2, Receipt, RefreshCw, Settings } from 'lucide-react';

const btnClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60';

export const ACCOUNTING_HEADER_EVENTS = {
  NEW_QUOTE: 'accounting:new-quote',
  NEW_INVOICE: 'accounting:new-invoice',
  QUOTE_SETTINGS: 'accounting:quote-settings',
  REFRESH: 'accounting:refresh',
  REFRESH_COMPLETE: 'accounting:refresh-complete',
} as const;

export function AccountingHeaderActions({ role }: { role: string }) {
  const isAdmin = role === 'admin';
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    function onRefreshComplete() {
      setRefreshing(false);
    }
    window.addEventListener(ACCOUNTING_HEADER_EVENTS.REFRESH_COMPLETE, onRefreshComplete);
    return () => {
      window.removeEventListener(ACCOUNTING_HEADER_EVENTS.REFRESH_COMPLETE, onRefreshComplete);
    };
  }, []);

  function dispatch(event: string) {
    window.dispatchEvent(new CustomEvent(event));
  }

  function onRefresh() {
    setRefreshing(true);
    dispatch(ACCOUNTING_HEADER_EVENTS.REFRESH);
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {isAdmin && (
        <>
          <button
            type="button"
            onClick={() => dispatch(ACCOUNTING_HEADER_EVENTS.NEW_QUOTE)}
            className={btnClass}
          >
            <FileText className="h-3.5 w-3.5 text-indigo-600" />
            New quote
          </button>
          <button
            type="button"
            onClick={() => dispatch(ACCOUNTING_HEADER_EVENTS.NEW_INVOICE)}
            className={btnClass}
          >
            <Receipt className="h-3.5 w-3.5 text-indigo-600" />
            New invoice
          </button>
          <button
            type="button"
            onClick={() => dispatch(ACCOUNTING_HEADER_EVENTS.QUOTE_SETTINGS)}
            className={btnClass}
          >
            <Settings className="h-3.5 w-3.5 text-indigo-600" />
            Quote settings
          </button>
        </>
      )}
      <button type="button" onClick={onRefresh} disabled={refreshing} className={btnClass}>
        {refreshing ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 text-indigo-600" />
        )}
        Refresh
      </button>
    </div>
  );
}
