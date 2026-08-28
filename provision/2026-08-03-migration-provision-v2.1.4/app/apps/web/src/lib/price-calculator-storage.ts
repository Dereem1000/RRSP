import {
  computePriceCalculator,
  PRICE_CALC_DEFAULTS,
  type PriceCalculatorInput,
  type PriceCalculatorResult,
} from '@/lib/price-calculator';

export type PriceCalculatorSettings = {
  conversionRate: number;
  shipping: number;
  profitPercent: number;
};

export type PriceCalculatorHistoryEntry = {
  id: string;
  itemName: string;
  usCost: number;
  conversionRate: number;
  shipping: number;
  profitPercent: number;
  ttCost: number;
  itemTotal: number;
  profitAmount: number;
  feeAmount: number;
  lineTotal: number;
  timestamp: string;
};

const SETTINGS_KEY = 'cd_price_calculator_settings';
const HISTORY_KEY = 'cd_price_calculator_history';
const MAX_HISTORY = 50;

export const PRICE_CALCULATOR_UPDATED_EVENT = 'cd-price-calculator-updated';
export const PRICE_CALCULATOR_OPEN_EVENT = 'cd-price-calculator-open';
export const PRICE_CALCULATOR_APPLY_EVENT = 'cd-price-calculator-apply';

export type PriceCalculatorApplyDetail = {
  itemName?: string;
  usCost: number;
  costPrice: number;
  clientPrice: number;
};

export function getPriceCalculatorSettings(): PriceCalculatorSettings {
  if (typeof window === 'undefined') return { ...PRICE_CALC_DEFAULTS };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...PRICE_CALC_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PriceCalculatorSettings>;
    return {
      conversionRate: Number(parsed.conversionRate) || PRICE_CALC_DEFAULTS.conversionRate,
      shipping: Number(parsed.shipping) || PRICE_CALC_DEFAULTS.shipping,
      profitPercent: Number(parsed.profitPercent) || PRICE_CALC_DEFAULTS.profitPercent,
    };
  } catch {
    return { ...PRICE_CALC_DEFAULTS };
  }
}

export function savePriceCalculatorSettings(settings: PriceCalculatorSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  dispatchUpdated();
}

export function loadPriceCalculatorHistory(): PriceCalculatorHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as PriceCalculatorHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function savePriceCalculatorHistory(entries: PriceCalculatorHistoryEntry[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  dispatchUpdated();
}

export function dispatchUpdated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRICE_CALCULATOR_UPDATED_EVENT));
  }
}

export function computeWithSettings(
  usCost: number,
  settings?: Partial<PriceCalculatorSettings>
): PriceCalculatorResult & PriceCalculatorInput {
  const merged = { ...getPriceCalculatorSettings(), ...settings };
  const input: PriceCalculatorInput = {
    usCost: Math.max(0, usCost),
    conversionRate: merged.conversionRate,
    shipping: merged.shipping,
    profitPercent: merged.profitPercent,
  };
  return { ...input, ...computePriceCalculator(input) };
}

/** v1 apply: item total → cost field, line total → client price. */
export function orderPricesFromUsCost(usCost: number, settings?: Partial<PriceCalculatorSettings>) {
  const r = computeWithSettings(usCost, settings);
  return {
    costPrice: r.itemTotal,
    clientPrice: r.lineTotal,
    ...r,
  };
}

export function appendPriceCalculatorHistory(input: {
  itemName: string;
  usCost: number;
  settings?: Partial<PriceCalculatorSettings>;
}): PriceCalculatorHistoryEntry {
  const settings = { ...getPriceCalculatorSettings(), ...input.settings };
  const r = computePriceCalculator({
    usCost: input.usCost,
    ...settings,
  });
  const entry: PriceCalculatorHistoryEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    itemName: input.itemName.trim() || 'Item',
    usCost: input.usCost,
    conversionRate: settings.conversionRate,
    shipping: settings.shipping,
    profitPercent: settings.profitPercent,
    ttCost: r.ttCost,
    itemTotal: r.itemTotal,
    profitAmount: r.profitAmount,
    feeAmount: r.feeAmount,
    lineTotal: r.lineTotal,
    timestamp: new Date().toISOString(),
  };
  const prev = loadPriceCalculatorHistory();
  const next = [entry, ...prev.filter((e) => e.id !== entry.id)].slice(0, MAX_HISTORY);
  savePriceCalculatorHistory(next);
  return entry;
}

export function clearPriceCalculatorHistory(): void {
  savePriceCalculatorHistory([]);
}

export function openPriceCalculator(prefill?: { itemName?: string; usCost?: number }): void {
  window.dispatchEvent(
    new CustomEvent(PRICE_CALCULATOR_OPEN_EVENT, { detail: prefill ?? {} })
  );
}

export function applyPriceCalculatorToOrder(detail: PriceCalculatorApplyDetail): void {
  window.dispatchEvent(
    new CustomEvent(PRICE_CALCULATOR_APPLY_EVENT, { detail })
  );
}
