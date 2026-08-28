import type { ActivationFeature } from '@/lib/license-constants';
import type { FeatureLicenseStatusEntry } from '@/lib/license-service';
import type {
  ManagementSystemClientRow,
  ManagementSystemOverview,
  ManagementSystemsOverviewData,
} from '@/lib/management-systems-shared';

/** Fully hidden — no partial serial leaked in the portal. */
export function maskLicenseSerial(serial: string | null | undefined): string | null {
  if (!serial) return null;
  return '••••-••••-••••';
}

export function redactFeatureLicenseStatusEntry(
  entry: FeatureLicenseStatusEntry | undefined,
  reveal: boolean
): FeatureLicenseStatusEntry | undefined {
  if (!entry || reveal) return entry;
  if (!entry.serialNumber) return entry;
  const { serialNumber: _removed, ...rest } = entry;
  return rest;
}

export function redactFeatureLicenseStatusMap(
  map: Partial<Record<ActivationFeature, FeatureLicenseStatusEntry>>,
  reveal: boolean
): Partial<Record<ActivationFeature, FeatureLicenseStatusEntry>> {
  if (reveal) return map;
  const out: Partial<Record<ActivationFeature, FeatureLicenseStatusEntry>> = {};
  for (const [key, entry] of Object.entries(map) as [ActivationFeature, FeatureLicenseStatusEntry][]) {
    out[key] = redactFeatureLicenseStatusEntry(entry, false)!;
  }
  return out;
}

function redactClientRow(row: ManagementSystemClientRow, reveal: boolean): ManagementSystemClientRow {
  if (reveal) return row;
  return {
    ...row,
    serialNumber: null,
  };
}

export function redactManagementSystemsOverview(
  data: ManagementSystemsOverviewData,
  reveal: boolean
): ManagementSystemsOverviewData {
  if (reveal) return data;
  return {
    ...data,
    systems: data.systems.map((system) => ({
      ...system,
      clients: system.clients.map((row) => redactClientRow(row, false)),
    })),
  };
}
