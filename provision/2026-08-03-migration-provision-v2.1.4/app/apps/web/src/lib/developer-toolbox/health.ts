import type { DevSlotConfig, DevSlotHealth, DevSlotId, DevToolboxAlert } from './types';
import { DEV_SLOT_IDS } from './constants';
import { publishDevToolboxAlertNotice } from './notices';
import { loadAlerts, loadHealth, saveAlerts, saveHealth } from './store';

export async function probeSlot(slot: DevSlotConfig): Promise<DevSlotHealth> {
  if (!slot.enabled || !slot.host.trim() || !slot.port) {
    return {
      status: 'cleared',
      lastCheck: new Date().toISOString(),
      latencyMs: null,
      error: null,
      downSince: null,
    };
  }

  const url = `http://${slot.host.trim()}:${slot.port}/`;
  const started = Date.now();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      redirect: 'manual',
    });
    clearTimeout(timer);

    return {
      status: 'up',
      lastCheck: new Date().toISOString(),
      latencyMs: Date.now() - started,
      error: null,
      downSince: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: 'down',
      lastCheck: new Date().toISOString(),
      latencyMs: null,
      error: message,
      downSince: new Date().toISOString(),
    };
  }
}

export async function runHealthChecks(slots: DevSlotConfig[]): Promise<Record<DevSlotId, DevSlotHealth>> {
  const previous = await loadHealth();
  const next: Record<DevSlotId, DevSlotHealth> = { ...previous };
  const alerts = await loadAlerts();
  const now = new Date().toISOString();

  for (const id of DEV_SLOT_IDS) {
    const slot = slots.find((s) => s.id === id)!;
    const result = await probeSlot(slot);

    if (result.status === 'down' && previous[id]?.status === 'up') {
      const alert: DevToolboxAlert = {
        id: `${id}-${Date.now()}`,
        slotId: id,
        hostname: slot.hostname,
        message: `${slot.label} (${slot.host}:${slot.port}) is unreachable`,
        level: 'error',
        createdAt: now,
        acknowledged: false,
      };
      alerts.unshift(alert);
      await publishDevToolboxAlertNotice(alert, slot);
    }

    if (result.status === 'up' && previous[id]?.status === 'down') {
      const alert: DevToolboxAlert = {
        id: `${id}-up-${Date.now()}`,
        slotId: id,
        hostname: slot.hostname,
        message: `${slot.label} is back online`,
        level: 'info',
        createdAt: now,
        acknowledged: false,
      };
      alerts.unshift(alert);
      await publishDevToolboxAlertNotice(alert, slot);
      result.downSince = null;
    } else if (result.status === 'down' && previous[id]?.downSince) {
      result.downSince = previous[id].downSince;
    }

    next[id] = result;
  }

  await saveHealth(next);
  await saveAlerts(alerts.slice(0, 50));
  return next;
}

export async function acknowledgeAlerts(ids?: string[]) {
  const alerts = await loadAlerts();
  const next = alerts.map((a) =>
    !ids || ids.length === 0 || ids.includes(a.id) ? { ...a, acknowledged: true } : a
  );
  await saveAlerts(next);
  return next;
}
