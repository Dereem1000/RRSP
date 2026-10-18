export type CatalogPolicyState = {
  federation_enabled?: boolean;
  consensus_mode?: 'two_stores' | 'majority' | 'min_count';
  min_agree_count?: number;
};

export function coerceCatalogPolicyBool(value: unknown, defaultValue = false): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return defaultValue;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '' || normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
      return false;
    }
    if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
      return true;
    }
  }
  return Boolean(value);
}

export function mergeCatalogPolicy(raw?: CatalogPolicyState | null): CatalogPolicyState {
  return {
    federation_enabled: coerceCatalogPolicyBool(raw?.federation_enabled, false),
    consensus_mode: (raw?.consensus_mode as CatalogPolicyState['consensus_mode']) || 'two_stores',
    min_agree_count: Number(raw?.min_agree_count) > 0 ? Number(raw?.min_agree_count) : 2,
  };
}

export function catalogPolicyPayload(policy: CatalogPolicyState): Record<string, unknown> {
  const merged = mergeCatalogPolicy(policy);
  return {
    federation_enabled: merged.federation_enabled === true,
    consensus_mode: merged.consensus_mode,
    min_agree_count: merged.min_agree_count,
  };
}
