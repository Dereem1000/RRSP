'use client';

import { useEffect, useRef, useState } from 'react';
import {
  getPriceCalculatorSettings,
  orderPricesFromUsCost,
  PRICE_CALCULATOR_APPLY_EVENT,
  PRICE_CALCULATOR_UPDATED_EVENT,
  type PriceCalculatorApplyDetail,
} from '@/lib/price-calculator-storage';

export function useOrderPriceAutofill({
  costPrice,
  itemName,
  enabled,
  onApply,
}: {
  costPrice: string;
  itemName: string;
  enabled: boolean;
  onApply: (patch: { clientPrice: string; costPrice?: string; itemName?: string }) => void;
}) {
  const [clientPriceManual, setClientPriceManual] = useState(false);
  const skipNextAuto = useRef(false);

  useEffect(() => {
    if (!enabled || clientPriceManual) return;
    const us = parseFloat(costPrice);
    if (!us || Number.isNaN(us)) return;

    const timer = setTimeout(() => {
      if (skipNextAuto.current) {
        skipNextAuto.current = false;
        return;
      }
      const { clientPrice } = orderPricesFromUsCost(us, getPriceCalculatorSettings());
      onApply({ clientPrice: clientPrice.toFixed(2) });
    }, 400);

    return () => clearTimeout(timer);
  }, [costPrice, enabled, clientPriceManual, onApply]);

  useEffect(() => {
    const onSettingsChange = () => {
      if (!enabled || clientPriceManual) return;
      const us = parseFloat(costPrice);
      if (!us || Number.isNaN(us)) return;
      const { clientPrice } = orderPricesFromUsCost(us);
      onApply({ clientPrice: clientPrice.toFixed(2) });
    };
    window.addEventListener(PRICE_CALCULATOR_UPDATED_EVENT, onSettingsChange);
    return () => window.removeEventListener(PRICE_CALCULATOR_UPDATED_EVENT, onSettingsChange);
  }, [costPrice, enabled, clientPriceManual, onApply]);

  useEffect(() => {
    const onApplyEvent = (e: Event) => {
      const detail = (e as CustomEvent<PriceCalculatorApplyDetail>).detail;
      if (!detail) return;
      skipNextAuto.current = true;
      setClientPriceManual(false);
      onApply({
        costPrice: detail.usCost.toFixed(2),
        clientPrice: detail.clientPrice.toFixed(2),
        ...(detail.itemName ? { itemName: detail.itemName } : {}),
      });
    };
    window.addEventListener(PRICE_CALCULATOR_APPLY_EVENT, onApplyEvent);
    return () => window.removeEventListener(PRICE_CALCULATOR_APPLY_EVENT, onApplyEvent);
  }, [onApply]);

  return {
    clientPriceManual,
    markClientPriceManual: () => setClientPriceManual(true),
    resetManual: () => setClientPriceManual(false),
  };
}
