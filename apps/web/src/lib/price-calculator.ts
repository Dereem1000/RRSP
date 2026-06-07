/** v1-compatible order price calculator (US cost → TT line total). */

export type PriceCalculatorInput = {
  usCost: number;
  conversionRate: number;
  shipping: number;
  profitPercent: number;
};

export type PriceCalculatorResult = {
  ttCost: number;
  itemTotal: number;
  profitAmount: number;
  feeAmount: number;
  lineTotal: number;
};

export const PRICE_CALC_DEFAULTS = {
  conversionRate: 7,
  shipping: 150,
  profitPercent: 35,
} as const;

export function computePriceCalculator(input: PriceCalculatorInput): PriceCalculatorResult {
  const usCost = Math.max(0, input.usCost);
  const conversionRate = Math.max(0, input.conversionRate);
  const shipping = Math.max(0, input.shipping);
  const profitPercent = Math.max(0, input.profitPercent);

  const ttCost = usCost * conversionRate;
  const itemTotal = ttCost + shipping;
  const profitAmount = itemTotal * (profitPercent / 100);
  const feeAmount = profitAmount * 0.1;
  const lineTotal = itemTotal + profitAmount + feeAmount;

  return { ttCost, itemTotal, profitAmount, feeAmount, lineTotal };
}

export function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}
