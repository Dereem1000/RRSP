import { SystemConfig } from '@cd-v2/database';
import {
  DEFAULT_CLOSING_MESSAGE,
  DEFAULT_PAYMENT_TERMS,
  DEFAULT_QUOTE_TAX_RATE,
  DEFAULT_WARRANTY_TERMS,
} from '@/lib/quote-defaults';

export type QuoteSettings = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyWebsite: string;
  companyLogo: string;
  taxRate: number;
  currency: string;
  paymentTerms: string;
  warrantyTerms: string;
  closingMessage: string;
};

export async function getQuoteSettings(): Promise<QuoteSettings> {
  const [
    companyName,
    companyAddress,
    companyPhone,
    companyWebsite,
    companyLogo,
    taxRate,
    currency,
    paymentTerms,
    warrantyTerms,
    closingMessage,
  ] = await Promise.all([
    SystemConfig.getConfig<string>('quote_company_name', 'Computer Dynamics'),
    SystemConfig.getConfig<string>(
      'quote_company_address',
      '#2 Banyan Blvd, Malabar, Arima Trinidad & Tobago'
    ),
    SystemConfig.getConfig<string>('quote_company_phone', ''),
    SystemConfig.getConfig<string>('quote_company_website', ''),
    SystemConfig.getConfig<string>('quote_company_logo', '/logo.svg'),
    SystemConfig.getConfig<number>('quote_tax_rate', DEFAULT_QUOTE_TAX_RATE),
    SystemConfig.getConfig<string>('quote_currency', 'TTD'),
    SystemConfig.getConfig<string>('quote_payment_terms', DEFAULT_PAYMENT_TERMS),
    SystemConfig.getConfig<string>('quote_warranty_terms', DEFAULT_WARRANTY_TERMS),
    SystemConfig.getConfig<string>('quote_closing_message', DEFAULT_CLOSING_MESSAGE),
  ]);

  return {
    companyName: companyName ?? 'Computer Dynamics',
    companyAddress: companyAddress ?? '',
    companyPhone: companyPhone ?? '',
    companyWebsite: companyWebsite ?? '',
    companyLogo: companyLogo ?? '/logo.svg',
    taxRate: Number.isFinite(Number(taxRate)) ? Number(taxRate) : DEFAULT_QUOTE_TAX_RATE,
    currency: currency ?? 'TTD',
    paymentTerms: paymentTerms ?? '',
    warrantyTerms: warrantyTerms ?? '',
    closingMessage: closingMessage ?? '',
  };
}

export async function updateQuoteSettings(updates: Partial<QuoteSettings>) {
  const tasks: Promise<unknown>[] = [];
  if (updates.companyName !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_company_name', updates.companyName));
  }
  if (updates.companyAddress !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_company_address', updates.companyAddress));
  }
  if (updates.companyPhone !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_company_phone', updates.companyPhone));
  }
  if (updates.companyWebsite !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_company_website', updates.companyWebsite));
  }
  if (updates.companyLogo !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_company_logo', updates.companyLogo));
  }
  if (updates.taxRate !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_tax_rate', updates.taxRate, 'number'));
  }
  if (updates.currency !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_currency', updates.currency));
  }
  if (updates.paymentTerms !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_payment_terms', updates.paymentTerms));
  }
  if (updates.warrantyTerms !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_warranty_terms', updates.warrantyTerms));
  }
  if (updates.closingMessage !== undefined) {
    tasks.push(SystemConfig.setConfig('quote_closing_message', updates.closingMessage));
  }
  await Promise.all(tasks);
}
