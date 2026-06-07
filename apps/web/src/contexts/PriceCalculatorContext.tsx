'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  appendPriceCalculatorHistory,
  clearPriceCalculatorHistory,
  getPriceCalculatorSettings,
  loadPriceCalculatorHistory,
  openPriceCalculator,
  PRICE_CALCULATOR_OPEN_EVENT,
  PRICE_CALCULATOR_UPDATED_EVENT,
  savePriceCalculatorSettings,
  type PriceCalculatorHistoryEntry,
  type PriceCalculatorSettings,
} from '@/lib/price-calculator-storage';
import { PRICE_CALC_DEFAULTS } from '@/lib/price-calculator';

type PriceCalculatorContextValue = {
  settings: PriceCalculatorSettings;
  history: PriceCalculatorHistoryEntry[];
  orderFormActive: boolean;
  updateSettings: (patch: Partial<PriceCalculatorSettings>) => void;
  recordCalculation: (input: { itemName: string; usCost: number }) => void;
  clearHistory: () => void;
  openCalculator: (prefill?: { itemName?: string; usCost?: number }) => void;
  registerOrderForm: () => () => void;
  refresh: () => void;
};

const PriceCalculatorContext = createContext<PriceCalculatorContextValue | null>(null);

export function PriceCalculatorProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PriceCalculatorSettings>(PRICE_CALC_DEFAULTS);
  const [history, setHistory] = useState<PriceCalculatorHistoryEntry[]>([]);
  const [orderFormActive, setOrderFormActive] = useState(false);

  const refresh = useCallback(() => {
    setSettings(getPriceCalculatorSettings());
    setHistory(loadPriceCalculatorHistory());
  }, []);

  useEffect(() => {
    refresh();
    const onUpdate = () => refresh();
    window.addEventListener(PRICE_CALCULATOR_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(PRICE_CALCULATOR_UPDATED_EVENT, onUpdate);
  }, [refresh]);

  const updateSettings = useCallback(
    (patch: Partial<PriceCalculatorSettings>) => {
      const next = { ...getPriceCalculatorSettings(), ...patch };
      savePriceCalculatorSettings(next);
      setSettings(next);
    },
    []
  );

  const recordCalculation = useCallback((input: { itemName: string; usCost: number }) => {
    if (!input.usCost || input.usCost <= 0) return;
    appendPriceCalculatorHistory({ itemName: input.itemName, usCost: input.usCost });
  }, []);

  const clearHistory = useCallback(() => {
    clearPriceCalculatorHistory();
  }, []);

  const registerOrderForm = useCallback(() => {
    setOrderFormActive(true);
    return () => setOrderFormActive(false);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      history,
      orderFormActive,
      updateSettings,
      recordCalculation,
      clearHistory,
      openCalculator: openPriceCalculator,
      registerOrderForm,
      refresh,
    }),
    [
      settings,
      history,
      orderFormActive,
      updateSettings,
      recordCalculation,
      clearHistory,
      registerOrderForm,
      refresh,
    ]
  );

  return (
    <PriceCalculatorContext.Provider value={value}>{children}</PriceCalculatorContext.Provider>
  );
}

export function usePriceCalculator() {
  const ctx = useContext(PriceCalculatorContext);
  if (!ctx) {
    throw new Error('usePriceCalculator must be used within PriceCalculatorProvider');
  }
  return ctx;
}

export function usePriceCalculatorOptional() {
  return useContext(PriceCalculatorContext);
}

/** Listen for sidebar open requests (e.g. from order form). */
/** Call from order create/edit forms so the calculator can offer “Apply to order”. */
export function useRegisterOrderPriceForm(active = true) {
  const ctx = usePriceCalculatorOptional();
  useEffect(() => {
    if (!active || !ctx) return;
    return ctx.registerOrderForm();
  }, [active, ctx]);
}

export function usePriceCalculatorOpenListener(
  onOpen: (detail: { itemName?: string; usCost?: number }) => void
) {
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ itemName?: string; usCost?: number }>).detail ?? {};
      onOpen(detail);
    };
    window.addEventListener(PRICE_CALCULATOR_OPEN_EVENT, handler);
    return () => window.removeEventListener(PRICE_CALCULATOR_OPEN_EVENT, handler);
  }, [onOpen]);
}
