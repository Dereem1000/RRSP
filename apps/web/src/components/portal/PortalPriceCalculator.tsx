'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Trash2, X } from 'lucide-react';
import { usePriceCalculator } from '@/contexts/PriceCalculatorContext';
import {
  applyPriceCalculatorToOrder,
  computeWithSettings,
  type PriceCalculatorHistoryEntry,
} from '@/lib/price-calculator-storage';
import { formatMoney } from '@/lib/price-calculator';

const inputClass =
  'w-full rounded-lg border border-white/15 bg-white/10 px-2 py-1.5 text-right text-sm text-white outline-none focus:border-cd-400 focus:ring-1 focus:ring-cd-400/40';

const HISTORY_PREVIEW = 5;

export function PortalPriceCalculator({
  showAdminFields,
  onClose,
  prefill,
}: {
  showAdminFields: boolean;
  onClose: () => void;
  prefill?: { itemName?: string; usCost?: number };
}) {
  const { settings, history, orderFormActive, updateSettings, recordCalculation, clearHistory } =
    usePriceCalculator();
  const [itemName, setItemName] = useState('');
  const [usCost, setUsCost] = useState('');
  const [copied, setCopied] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const lastRecorded = useRef<string>('');

  const visibleHistory = showAllHistory ? history : history.slice(0, HISTORY_PREVIEW);
  const hasMoreHistory = history.length > HISTORY_PREVIEW;

  useEffect(() => {
    if (prefill?.itemName) setItemName(prefill.itemName);
    if (prefill?.usCost != null && prefill.usCost > 0) {
      setUsCost(String(prefill.usCost));
    }
  }, [prefill]);

  useEffect(() => () => setShowAllHistory(false), []);

  const result = useMemo(() => {
    const cost = parseFloat(usCost) || 0;
    return computeWithSettings(cost, settings);
  }, [usCost, settings]);

  useEffect(() => {
    const cost = parseFloat(usCost) || 0;
    if (cost <= 0) return;
    const key = `${itemName}|${cost}|${settings.conversionRate}|${settings.shipping}|${settings.profitPercent}`;
    if (key === lastRecorded.current) return;
    const timer = setTimeout(() => {
      lastRecorded.current = key;
      recordCalculation({ itemName, usCost: cost });
    }, 800);
    return () => clearTimeout(timer);
  }, [itemName, usCost, settings, recordCalculation]);

  const loadHistoryRow = useCallback((row: PriceCalculatorHistoryEntry) => {
    setItemName(row.itemName);
    setUsCost(String(row.usCost));
    updateSettings({
      conversionRate: row.conversionRate,
      shipping: row.shipping,
      profitPercent: row.profitPercent,
    });
  }, [updateSettings]);

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      /* ignore */
    }
  }

  function saveToHistory() {
    const cost = parseFloat(usCost) || 0;
    if (cost <= 0) return;
    recordCalculation({ itemName, usCost: cost });
    lastRecorded.current = `${itemName}|${cost}|${settings.conversionRate}|${settings.shipping}|${settings.profitPercent}`;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  function applyToOrderForm() {
    const cost = parseFloat(usCost) || 0;
    if (cost <= 0) return;
    applyPriceCalculatorToOrder({
      itemName: itemName.trim() || undefined,
      usCost: cost,
      costPrice: result.itemTotal,
      clientPrice: result.lineTotal,
    });
    saveToHistory();
  }

  return (
    <div className="flex max-h-[min(52vh,480px)] flex-col border-t border-white/10 bg-cd-900/95">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-cd-300">Price calculator</p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"
          aria-label="Close calculator"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-xs">
        <p className="rounded-lg bg-white/5 px-2 py-1.5 text-[11px] leading-relaxed text-slate-400">
          {orderFormActive
            ? 'Quote mode or order open — use Apply to order, or save a standalone calculation to history.'
            : 'Standalone quote — enter US cost to see client price. Saves to history automatically; use Save or Copy.'}
        </p>
        <label className="block">
          <span className="mb-1 block text-slate-400">Item</span>
          <input
            type="text"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            className={inputClass + ' text-left'}
            placeholder="Item name"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-slate-400">US cost</span>
          <input
            type="number"
            min={0}
            step={0.01}
            value={usCost}
            onChange={(e) => setUsCost(e.target.value)}
            className={inputClass}
          />
        </label>
        {showAdminFields && (
          <label className="block">
            <span className="mb-1 block text-slate-400">Conversion rate</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settings.conversionRate}
              onChange={(e) =>
                updateSettings({ conversionRate: parseFloat(e.target.value) || 0 })
              }
              className={inputClass}
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/5 px-2 py-1.5">
            <p className="text-[10px] uppercase text-slate-500">TT cost</p>
            <p className="text-sm font-medium text-white">{formatMoney(result.ttCost)}</p>
          </div>
          <label className="block">
            <span className="mb-1 block text-slate-400">Shipping</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={settings.shipping}
              onChange={(e) => updateSettings({ shipping: parseFloat(e.target.value) || 0 })}
              className={inputClass}
            />
          </label>
        </div>
        <div className="rounded-lg bg-white/5 px-2 py-1.5">
          <p className="text-[10px] uppercase text-slate-500">Item total (cost)</p>
          <p className="text-sm font-medium text-white">{formatMoney(result.itemTotal)}</p>
        </div>
        {showAdminFields && (
          <>
            <label className="block">
              <span className="mb-1 block text-slate-400">Profit %</span>
              <input
                type="number"
                min={0}
                step={1}
                value={settings.profitPercent}
                onChange={(e) =>
                  updateSettings({ profitPercent: parseFloat(e.target.value) || 0 })
                }
                className={inputClass}
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-white/5 px-2 py-1.5">
                <p className="text-[10px] uppercase text-slate-500">Profit</p>
                <p className="text-sm font-medium text-white">{formatMoney(result.profitAmount)}</p>
              </div>
              <div className="rounded-lg bg-white/5 px-2 py-1.5">
                <p className="text-[10px] uppercase text-slate-500">10% fee</p>
                <p className="text-sm font-medium text-white">{formatMoney(result.feeAmount)}</p>
              </div>
            </div>
          </>
        )}
        <div className="rounded-xl bg-cd-500/20 px-3 py-2 ring-1 ring-cd-500/30">
          <p className="text-[10px] uppercase text-cd-300">Client price</p>
          <p className="text-lg font-bold text-white">{formatMoney(result.lineTotal)}</p>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-1">
          <button
            type="button"
            onClick={saveToHistory}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-cd-500 px-2 py-1.5 text-xs font-medium text-white hover:bg-cd-400"
          >
            {savedFlash ? 'Saved' : 'Save calculation'}
          </button>
          {orderFormActive && (
            <button
              type="button"
              onClick={applyToOrderForm}
              className="flex flex-1 items-center justify-center rounded-lg border border-cd-400/50 bg-cd-500/10 px-2 py-1.5 text-xs font-medium text-cd-200 hover:bg-cd-500/20"
            >
              Apply to order
            </button>
          )}
          <button
            type="button"
            onClick={() => void copyText('line', result.lineTotal.toFixed(2))}
            title="Copy client price"
            className="flex items-center gap-1 rounded-lg border border-white/15 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10"
          >
            <Copy className="h-3 w-3" />
            {copied === 'line' ? 'OK' : 'Client'}
          </button>
          <button
            type="button"
            onClick={() =>
              void copyText(
                'all',
                `Item: ${itemName || 'Item'}\nUS: ${usCost}\nClient: ${result.lineTotal.toFixed(2)}`
              )
            }
            title="Copy summary"
            className="rounded-lg border border-white/15 px-2 py-1.5 text-xs text-slate-300 hover:bg-white/10"
          >
            {copied === 'all' ? 'OK' : 'All'}
          </button>
        </div>

        <div className="border-t border-white/10 pt-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase text-slate-500">
              History ({history.length})
            </p>
            {history.length > 0 && (
              <button
                type="button"
                onClick={clearHistory}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-red-300"
              >
                <Trash2 className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>
          {history.length === 0 ? (
            <p className="text-slate-500">Calculations appear here automatically.</p>
          ) : (
            <>
              <ul
                className={`space-y-1 ${showAllHistory ? 'max-h-36 overflow-y-auto' : ''}`}
              >
                {visibleHistory.map((row) => (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => loadHistoryRow(row)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white/10"
                    >
                      <span className="min-w-0 truncate text-slate-300">{row.itemName}</span>
                      <span className="shrink-0 text-slate-500">{formatMoney(row.usCost)}</span>
                      <span className="shrink-0 font-medium text-white">
                        {formatMoney(row.lineTotal)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {hasMoreHistory && (
                <button
                  type="button"
                  onClick={() => setShowAllHistory((v) => !v)}
                  className="mt-1.5 w-full rounded-lg py-1 text-[11px] font-medium text-cd-300 hover:bg-white/10 hover:text-white"
                >
                  {showAllHistory ? 'Show less' : `Show all (${history.length})`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
