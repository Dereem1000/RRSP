/** Canonical quote/document terms carried forward from v1 msp-clients.html + emailService.js */
export const DEFAULT_PAYMENT_TERMS = `Payments for parts are required before orders are placed for replacement parts.

Balance due upon completion of work for installation or any other related cost.

Payment methods accepted: cash, bank transfer, or card.`;

export const DEFAULT_WARRANTY_TERMS = `14-days warranty on all installed parts and labor, can be less based on manufacture.

Warranty is void if the device is physically damaged, liquid damaged, or tampered with after repair.

Warranty does not cover software or data-related issues.`;

export const DEFAULT_CLOSING_MESSAGE =
  'Thank you for choosing Computer Dynamics — your trusted IT and repair partner.';

export const DEFAULT_QUOTE_TAX_RATE = 15;

/** Legacy v2 placeholders that never matched v1 business terms. */
export const LEGACY_PLACEHOLDER_PAYMENT_TERMS = 'Payment is due within 30 days of invoice date.';
export const LEGACY_PLACEHOLDER_WARRANTY_TERMS = 'All products come with a 1-year warranty.';
export const LEGACY_PLACEHOLDER_CLOSING_MESSAGE = 'Thank you for your business!';
