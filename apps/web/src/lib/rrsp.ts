import { getActivationFeatures, type ActivationFeature } from '@/lib/license-constants';

export const RRSP_MODULES = [
  'tickets',
  'orders',
  'parts',
  'sales',
  'clients',
  'accounting',
  'pos',
] as const;

export type RrspModule = (typeof RRSP_MODULES)[number];

/** Labels shown in License & activation submenu and RRSP nav. */
export const RRSP_MODULE_LABELS: Record<RrspModule, string> = {
  tickets: 'Shop tickets',
  orders: 'Shop orders',
  parts: 'Shop parts',
  sales: 'Shop sales',
  clients: 'Customers',
  accounting: 'Shop accounting',
  pos: 'Shop POS',
};

export const RRSP_MODULE_HREF: Record<RrspModule, string> = {
  tickets: '/rrsp/tickets',
  orders: '/rrsp/orders',
  parts: '/rrsp/parts',
  sales: '/rrsp/sales',
  clients: '/rrsp/clients',
  accounting: '/rrsp/accounting',
  pos: '/rrsp/pos',
};

export const RRSP_HREF_TO_MODULE: Partial<Record<string, RrspModule>> = {
  '/rrsp/tickets': 'tickets',
  '/rrsp/orders': 'orders',
  '/rrsp/parts': 'parts',
  '/rrsp/sales': 'sales',
  '/rrsp/clients': 'clients',
  '/rrsp/accounting': 'accounting',
  '/rrsp/pos': 'pos',
};

export type RrspModulesState = Partial<Record<RrspModule, boolean>>;

export function isRrspEnabled(features: unknown): boolean {
  return getActivationFeatures(features).includes('rrsp' as ActivationFeature);
}

/** Repair plan blobs that were spread from a JSON string (char-index maps). */
export function normalizeServicePlanData(raw: unknown): Record<string, unknown> {
  let value: unknown = raw;
  for (let depth = 0; depth < 4; depth++) {
    if (value == null) return {};
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return {};
      try {
        value = JSON.parse(trimmed);
        continue;
      } catch {
        return {};
      }
    }
    if (typeof value !== 'object' || Array.isArray(value)) return {};
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > 0 && keys.every((k) => /^\d+$/.test(k))) {
      const joined = keys
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => obj[k])
        .join('');
      value = joined;
      continue;
    }
    return obj;
  }
  return {};
}

export function allRrspModulesEnabled(): RrspModulesState {
  const out: RrspModulesState = {};
  for (const key of RRSP_MODULES) out[key] = true;
  return out;
}

export function getRrspModules(servicePlanData: unknown): RrspModulesState {
  const plan = normalizeServicePlanData(servicePlanData);
  const raw = plan.rrspModules;
  // Never configured → all pages on (license/feature gate still applies).
  if (raw === undefined || raw === null) return allRrspModulesEnabled();
  if (typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: RrspModulesState = {};
  for (const key of RRSP_MODULES) {
    if ((raw as Record<string, unknown>)[key] === true) out[key] = true;
  }
  return out;
}

export function isRrspModuleEnabled(servicePlanData: unknown, module: RrspModule): boolean {
  return getRrspModules(servicePlanData)[module] === true;
}

export function parseRrspModulesFromForm(form: FormData): RrspModulesState {
  const selected = new Set(form.getAll('rrspModules').map(String));
  const out: RrspModulesState = {};
  for (const key of RRSP_MODULES) {
    out[key] = selected.has(key);
  }
  return out;
}

/** Filesystem-safe folder name; append short id when provided. */
export function sanitizeRrspClientFolderName(name: string, clientId?: string | null): string {
  const base = String(name || 'client')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
    .toLowerCase();
  const safe = base || 'client';
  if (!clientId) return safe;
  const suffix = String(clientId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase();
  return suffix ? `${safe}-${suffix}` : safe;
}
