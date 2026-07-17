import { randomBytes } from 'crypto';
import { FEATURE_TO_LICENSE_KEY, type ActivationFeature } from '@/lib/license-constants';

const MSP_FEATURE_LONG_CODES: Record<ActivationFeature, string> = {
  pos: 'POINTOFSALE',
  restaurant: 'RESTAURANT',
  document: 'DOCUMENT',
  ecommerce: 'ECOMMERCE',
  auto: 'AUTOSYSTEM',
  distribution: 'DISTRIBUTION',
  crm: 'EVENTSPONSORCRM',
};

const LICENSE_KEY_TO_CODE: Record<string, string> = {
  pos_systems: 'POINTOFSALE',
  restaurant_management: 'RESTAURANT',
  document_management: 'DOCUMENT',
  ecommerce_websites: 'ECOMMERCE',
  auto_system: 'AUTOSYSTEM',
  distribution_system: 'DISTRIBUTION',
  customer_management: 'EVENTSPONSORCRM',
};

const MIN_CLIENT_REF_LEN = 16;
const MIN_UNIQUE_SUFFIX_LEN = 32;

export function normalizeClientRef(mspClientId?: string | null): string {
  let raw = (mspClientId || randomBytes(16).toString('hex')).replace(/-/g, '').toUpperCase();
  if (raw.length < MIN_CLIENT_REF_LEN) {
    raw = (raw + randomBytes(16).toString('hex')).toUpperCase();
  }
  return raw.slice(0, 32);
}

export function featureCodeForMspFeature(feature: ActivationFeature | string): string {
  const key = feature.toLowerCase() as ActivationFeature;
  const code = MSP_FEATURE_LONG_CODES[key];
  if (code) return code;
  const sanitized = String(feature).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return sanitized.slice(0, 24) || 'GENERAL';
}

export function primarySystemCodeFromFeatures(features: Record<string, boolean>): string {
  for (const [key, code] of Object.entries(LICENSE_KEY_TO_CODE)) {
    if (features[key]) return code;
  }
  return 'GENERAL';
}

export function generateCompanySerial(mspClientId?: string | null): string {
  const clientRef = normalizeClientRef(mspClientId);
  const unique = randomBytes(16).toString('hex').toUpperCase();
  return `CD-COMP-${clientRef}-${unique}`;
}

export function generateLicenseSerial(input: {
  mspFeature?: ActivationFeature | string;
  featureCode?: string;
  mspClientId?: string | null;
  features?: Record<string, boolean>;
  deviceSeat?: number;
}): string {
  const code =
    input.featureCode ??
    (input.mspFeature
      ? featureCodeForMspFeature(input.mspFeature)
      : primarySystemCodeFromFeatures(input.features ?? {}));
  const clientRef = normalizeClientRef(input.mspClientId);
  const unique = randomBytes(16).toString('hex').toUpperCase();
  const seatPart = input.deviceSeat && input.deviceSeat > 1 ? `-D${input.deviceSeat}` : '';
  return `CD-LIC-${code}-${clientRef}${seatPart}-${unique}`;
}

export function licenseKeyForFeature(feature: ActivationFeature): string {
  return FEATURE_TO_LICENSE_KEY[feature];
}
