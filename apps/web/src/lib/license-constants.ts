export const ACTIVATION_FEATURES = [
  'pos',
  'restaurant',
  'document',
  'ecommerce',
  'auto',
  'distribution',
  'crm',
] as const;

export type ActivationFeature = (typeof ACTIVATION_FEATURES)[number];

export const ACTIVATION_FEATURE_LABELS: Record<ActivationFeature, { title: string; description: string }> = {
  pos: {
    title: 'Point of Sale Systems',
    description: 'Custom POS for retail, restaurants, and service providers.',
  },
  restaurant: {
    title: 'Restaurant Management',
    description: 'Inventory, staff scheduling, and customer management.',
  },
  document: {
    title: 'Document Management',
    description: 'Digital filing, workflow automation, and secure storage.',
  },
  ecommerce: {
    title: 'E-commerce Websites',
    description: 'Online stores with payments, inventory, and client portals.',
  },
  auto: {
    title: 'Auto System',
    description: 'Automotive shop management with vehicle tracking and workflows.',
  },
  distribution: {
    title: 'Distribution System',
    description: 'Inventory, orders, and supply chain optimization.',
  },
  crm: {
    title: 'Event Sponsor CRM',
    description: 'Sponsor management, communications, and event CRM workflows.',
  },
};

/** MSP client feature key → license DB JSON key */
export const FEATURE_TO_LICENSE_KEY: Record<ActivationFeature, string> = {
  pos: 'pos_systems',
  restaurant: 'restaurant_management',
  document: 'document_management',
  ecommerce: 'ecommerce_websites',
  auto: 'auto_system',
  distribution: 'distribution_system',
  crm: 'customer_management',
};

export const MSP_SERVICE_LEVELS = ['basic', 'standard', 'premium', 'enterprise', 'per-job'] as const;

export function parseClientFeatures(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((f) => typeof f === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function getActivationFeatures(raw: unknown): ActivationFeature[] {
  return parseClientFeatures(raw).filter((f): f is ActivationFeature =>
    ACTIVATION_FEATURES.includes(f as ActivationFeature)
  );
}

/** Derive MSP activation feature keys from license DB rows */
export function activationFeaturesFromLicenseRows(
  licenses: Array<{ features: Record<string, boolean> }>
): ActivationFeature[] {
  const found = new Set<ActivationFeature>();
  for (const license of licenses) {
    for (const feature of ACTIVATION_FEATURES) {
      const key = FEATURE_TO_LICENSE_KEY[feature];
      if (license.features[key]) found.add(feature);
    }
  }
  return ACTIVATION_FEATURES.filter((f) => found.has(f));
}

/** Merge stored client.features with features inferred from the license DB */
export function mergeActivationFeatures(
  stored: unknown,
  fromLicense: ActivationFeature[]
): ActivationFeature[] {
  const set = new Set([...getActivationFeatures(stored), ...fromLicense]);
  return ACTIVATION_FEATURES.filter((f) => set.has(f));
}

export function mapServiceLevelToLicense(serviceLevel: string | null | undefined) {
  const mapping: Record<
    string,
    { licenseType: string; maxUsers: number; features: Record<string, boolean | number> }
  > = {
    basic: {
      licenseType: 'basic',
      maxUsers: 5,
      features: {
        inventory_management: true,
        advanced_reporting: false,
        api_access: false,
        multi_location: false,
      },
    },
    standard: {
      licenseType: 'premium',
      maxUsers: 10,
      features: {
        inventory_management: true,
        advanced_reporting: true,
        api_access: true,
        multi_location: false,
      },
    },
    premium: {
      licenseType: 'premium',
      maxUsers: 25,
      features: {
        inventory_management: true,
        advanced_reporting: true,
        api_access: true,
        multi_location: false,
      },
    },
    enterprise: {
      licenseType: 'enterprise',
      maxUsers: 100,
      features: {
        inventory_management: true,
        advanced_reporting: true,
        api_access: true,
        multi_location: true,
      },
    },
    'per-job': {
      licenseType: 'basic',
      maxUsers: 3,
      features: {
        inventory_management: true,
        advanced_reporting: false,
        api_access: false,
        multi_location: false,
      },
    },
  };
  return mapping[serviceLevel ?? 'basic'] ?? mapping.basic;
}

/** Shared between portal client unlock UI and MSP API routes. */
export const LICENSE_SERIAL_REVEAL_COOKIE = 'cd_license_serial_reveal';
export const LICENSE_SERIAL_REVEAL_HEADER = 'x-cd-license-serial-reveal';
export const LICENSE_SERIAL_REVEAL_STORAGE_KEY = 'cd_license_serial_reveal_token';
