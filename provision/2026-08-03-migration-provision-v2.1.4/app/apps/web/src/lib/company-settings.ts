import { SystemConfig } from '@cd-v2/database';
import { getQuoteSettings, updateQuoteSettings, type QuoteSettings } from '@/lib/quote-settings';

export type CompanySettings = QuoteSettings;

/** Load company profile used on quotes, invoices, and emails. */
export async function getCompanySettings(): Promise<CompanySettings> {
  return getQuoteSettings();
}

/** Persist company profile and keep legacy email_* company keys in sync. */
export async function saveCompanySettings(updates: Partial<CompanySettings>) {
  await updateQuoteSettings(updates);

  const sync: Array<[string, string]> = [];
  if (updates.companyName !== undefined) sync.push(['email_company_name', updates.companyName]);
  if (updates.companyAddress !== undefined) sync.push(['email_company_address', updates.companyAddress]);
  if (updates.companyPhone !== undefined) sync.push(['email_company_phone', updates.companyPhone]);
  if (updates.companyWebsite !== undefined) sync.push(['email_company_website', updates.companyWebsite]);

  for (const [key, value] of sync) {
    await SystemConfig.setConfig(key, value, 'string', 'email');
  }
}
