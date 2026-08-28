import { SystemConfig } from '@cd-v2/database';

export type WiPaySettings = {
  enabled: boolean;
  accountNumber: string;
  apiKey: string;
  environment: 'live' | 'sandbox';
  feeStructure: 'customer_pay' | 'merchant_absorb' | 'split';
  countryCode: 'TT' | 'JM' | 'BB' | 'GY';
  origin: string;
};

export async function getWiPaySettings(): Promise<WiPaySettings> {
  const [enabled, accountNumber, apiKey, environment, feeStructure] = await Promise.all([
    SystemConfig.getConfig<boolean>('wipay_enabled', process.env.WIPAY_ENABLED === 'true'),
    SystemConfig.getConfig<string>('wipay_account_number', process.env.WIPAY_ACCOUNT_NUMBER ?? ''),
    SystemConfig.getConfig<string>('wipay_api_key', process.env.WIPAY_API_KEY ?? ''),
    SystemConfig.getConfig<string>('wipay_environment', process.env.WIPAY_ENVIRONMENT ?? 'live'),
    SystemConfig.getConfig<string>('wipay_fee_structure', process.env.WIPAY_FEE_STRUCTURE ?? 'customer_pay'),
  ]);

  return {
    enabled: Boolean(enabled) && Boolean(String(accountNumber ?? '').trim()),
    accountNumber: String(accountNumber ?? '').trim(),
    apiKey: String(apiKey ?? '').trim() || '123',
    environment: environment === 'sandbox' ? 'sandbox' : 'live',
    feeStructure:
      feeStructure === 'merchant_absorb' || feeStructure === 'split' ? feeStructure : 'customer_pay',
    countryCode: 'TT',
    origin: 'ComputerDynamics-v2',
  };
}

export function isWiPayConfigured(settings: WiPaySettings) {
  return settings.enabled && settings.accountNumber.length > 0;
}
