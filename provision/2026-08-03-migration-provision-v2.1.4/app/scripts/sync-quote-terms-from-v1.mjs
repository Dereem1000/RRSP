/**
 * Sync quote payment/warranty/closing terms from v1 canonical defaults.
 * Run: node scripts/sync-quote-terms-from-v1.mjs
 * Dry run: node scripts/sync-quote-terms-from-v1.mjs --dry-run
 */
import { getSequelize } from '../packages/database/dist/connection.js';
import { SystemConfig } from '../packages/database/dist/index.js';

const DEFAULT_PAYMENT_TERMS = `Payments for parts are required before orders are placed for replacement parts.

Balance due upon completion of work for installation or any other related cost.

Payment methods accepted: cash, bank transfer, or card.`;

const DEFAULT_WARRANTY_TERMS = `14-days warranty on all installed parts and labor, can be less based on manufacture.

Warranty is void if the device is physically damaged, liquid damaged, or tampered with after repair.

Warranty does not cover software or data-related issues.`;

const DEFAULT_CLOSING_MESSAGE =
  'Thank you for choosing Computer Dynamics — your trusted IT and repair partner.';

const DEFAULT_QUOTE_TAX_RATE = 15;

const LEGACY = {
  payment: 'Payment is due within 30 days of invoice date.',
  warranty: 'All products come with a 1-year warranty.',
  closing: 'Thank you for your business!',
};

const dryRun = process.argv.includes('--dry-run');
const sequelize = getSequelize();
await sequelize.authenticate();

const current = {
  payment: await SystemConfig.getConfig('quote_payment_terms', ''),
  warranty: await SystemConfig.getConfig('quote_warranty_terms', ''),
  closing: await SystemConfig.getConfig('quote_closing_message', ''),
  taxRate: Number(await SystemConfig.getConfig('quote_tax_rate', 0)),
};

const updates = [];

if (!current.payment || current.payment === LEGACY.payment) {
  updates.push(['quote_payment_terms', DEFAULT_PAYMENT_TERMS, 'string']);
}
if (!current.warranty || current.warranty === LEGACY.warranty) {
  updates.push(['quote_warranty_terms', DEFAULT_WARRANTY_TERMS, 'string']);
}
if (!current.closing || current.closing === LEGACY.closing) {
  updates.push(['quote_closing_message', DEFAULT_CLOSING_MESSAGE, 'string']);
}
if (current.taxRate == null || Number.isNaN(Number(current.taxRate)) || current.taxRate === 12.5) {
  updates.push(['quote_tax_rate', DEFAULT_QUOTE_TAX_RATE, 'number']);
}

if (!updates.length) {
  console.log('Quote terms already match v1 — no changes needed.');
} else {
  console.log(`${dryRun ? 'Would update' : 'Updating'} ${updates.length} setting(s):`);
  for (const [key, value, type] of updates) {
    console.log(`  ${key}`);
    if (!dryRun) {
      await SystemConfig.setConfig(key, value, type);
    }
  }
}

await sequelize.close();
console.log(dryRun ? 'Dry run complete.' : 'Quote terms synced from v1.');
