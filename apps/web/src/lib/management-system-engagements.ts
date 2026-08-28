import { SystemConfig } from '@cd-v2/database';
import type { ActivationFeature } from '@/lib/license-constants';
import type { DigitalLicenseCertificate } from '@/lib/digital-license-shared';

export const CONFIG_KEY_ENGAGEMENTS = 'management_system_engagements';
export const CONFIG_CATEGORY = 'management_systems';

export type GateStatus = 'none' | 'running' | 'passed' | 'failed' | 'passed_with_warnings';
export type DeliverableStatus = 'none' | 'draft' | 'sent';

export type ManagementSystemEngagement = {
  clientId: string;
  feature: ActivationFeature;
  customerName: string;
  provisionStatus: GateStatus;
  provisionRunId?: string;
  provisionAt?: string;
  installStatus: GateStatus;
  installRunId?: string;
  installAt?: string;
  deliverableDraft?: {
    placeholders: Record<string, string>;
    staffMarkdown: string;
  };
  deliverableClientMarkdown?: string;
  deliverableStatus: DeliverableStatus;
  deliverableSentAt?: string;
  digitalLicense?: DigitalLicenseCertificate;
  updatedAt?: string;
};

export type EngagementStore = Record<string, ManagementSystemEngagement>;

function engagementKey(clientId: string, feature: ActivationFeature): string {
  return `${clientId}:${feature}`;
}

export function normalizeGateResult(raw: unknown): GateStatus {
  const label = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  if (label === 'PASSED' || label === 'PASS') return 'passed';
  if (label === 'PASSED_WITH_WARNINGS') return 'passed_with_warnings';
  if (label === 'FAILED' || label === 'FAIL') return 'failed';
  if (label === 'RUNNING') return 'running';
  return 'none';
}

export function gateStatusPassed(status: GateStatus): boolean {
  return status === 'passed' || status === 'passed_with_warnings';
}

async function loadStore(): Promise<EngagementStore> {
  const stored = await SystemConfig.getConfig<EngagementStore>(CONFIG_KEY_ENGAGEMENTS, {});
  return stored && typeof stored === 'object' ? stored : {};
}

async function saveStore(store: EngagementStore): Promise<void> {
  await SystemConfig.setConfig(CONFIG_KEY_ENGAGEMENTS, store, 'json', CONFIG_CATEGORY);
}

export async function listEngagements(filters?: {
  clientId?: string;
  feature?: ActivationFeature;
}): Promise<ManagementSystemEngagement[]> {
  const store = await loadStore();
  let rows = Object.values(store);
  if (filters?.clientId) {
    rows = rows.filter((r) => r.clientId === filters.clientId);
  }
  if (filters?.feature) {
    rows = rows.filter((r) => r.feature === filters.feature);
  }
  return rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function getEngagement(
  clientId: string,
  feature: ActivationFeature
): Promise<ManagementSystemEngagement | null> {
  const store = await loadStore();
  return store[engagementKey(clientId, feature)] ?? null;
}

export async function upsertEngagement(
  patch: Partial<ManagementSystemEngagement> & { clientId: string; feature: ActivationFeature }
): Promise<ManagementSystemEngagement> {
  const store = await loadStore();
  const key = engagementKey(patch.clientId, patch.feature);
  const existing = store[key];
  const now = new Date().toISOString();

  const merged: ManagementSystemEngagement = {
    clientId: patch.clientId,
    feature: patch.feature,
    customerName: patch.customerName ?? existing?.customerName ?? '',
    provisionStatus: patch.provisionStatus ?? existing?.provisionStatus ?? 'none',
    provisionRunId: patch.provisionRunId ?? existing?.provisionRunId,
    provisionAt: patch.provisionAt ?? existing?.provisionAt,
    installStatus: patch.installStatus ?? existing?.installStatus ?? 'none',
    installRunId: patch.installRunId ?? existing?.installRunId,
    installAt: patch.installAt ?? existing?.installAt,
    deliverableDraft: patch.deliverableDraft ?? existing?.deliverableDraft,
    deliverableClientMarkdown: patch.deliverableClientMarkdown ?? existing?.deliverableClientMarkdown,
    deliverableStatus: patch.deliverableStatus ?? existing?.deliverableStatus ?? 'none',
    deliverableSentAt: patch.deliverableSentAt ?? existing?.deliverableSentAt,
    digitalLicense: patch.digitalLicense ?? existing?.digitalLicense,
    updatedAt: now,
  };

  store[key] = merged;
  await saveStore(store);
  return merged;
}

export async function recordGateResult(input: {
  clientId: string;
  feature: ActivationFeature;
  customerName?: string;
  phase: 'Complete' | 'Install' | string;
  result: unknown;
  runId?: string;
}): Promise<ManagementSystemEngagement> {
  const status = normalizeGateResult(input.result);
  const now = new Date().toISOString();
  const isInstall = String(input.phase).toLowerCase() === 'install';

  return upsertEngagement({
    clientId: input.clientId,
    feature: input.feature,
    customerName: input.customerName,
    ...(isInstall
      ? {
          installStatus: status,
          installRunId: input.runId,
          installAt: now,
        }
      : {
          provisionStatus: status,
          provisionRunId: input.runId,
          provisionAt: now,
        }),
  });
}
