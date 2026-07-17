import { execFile, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { getMonorepoRoot, SystemConfig } from '@cd-v2/database';
import {
  CONFIG_CATEGORY,
  CONFIG_KEY_ALERTS,
  CONFIG_KEY_HEALTH,
  CONFIG_KEY_META,
  CONFIG_KEY_SLOTS,
  defaultSlots,
  DEV_SLOT_IDS,
  DOMAIN,
  TUNNEL_ID,
} from './constants';
import type {
  DevSlotConfig,
  DevSlotHealth,
  DevSlotId,
  DevToolboxAlert,
  DevToolboxState,
} from './types';
import { ensureDockedMiniRunning } from '@/lib/mini-dock';
import { getTunnelMeta, writeTunnelConfigFromSlots } from './tunnel-config';

const execFileAsync = promisify(execFile);

export class DeveloperToolboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeveloperToolboxError';
  }
}

function slotHostname(id: DevSlotId): string {
  return `${id}.${DOMAIN}`;
}

export async function loadSlots(): Promise<DevSlotConfig[]> {
  const stored = await SystemConfig.getConfig<DevSlotConfig[]>(CONFIG_KEY_SLOTS, null);
  if (!stored || !Array.isArray(stored)) return defaultSlots();

  const byId = new Map(stored.map((s) => [s.id, s]));
  return DEV_SLOT_IDS.map((id) => {
    const base = defaultSlots().find((s) => s.id === id)!;
    const row = byId.get(id);
    return {
      ...base,
      ...row,
      id,
      hostname: slotHostname(id),
      port: Number(row?.port ?? base.port) || base.port,
      enabled: Boolean(row?.enabled),
      host: String(row?.host ?? '').trim(),
      label: String(row?.label ?? base.label).trim() || base.label,
      note: row?.note ?? base.note,
    };
  });
}

export async function saveSlots(slots: DevSlotConfig[]): Promise<DevSlotConfig[]> {
  const normalized = DEV_SLOT_IDS.map((id) => {
    const incoming = slots.find((s) => s.id === id);
    const base = defaultSlots().find((s) => s.id === id)!;
    return {
      ...base,
      ...incoming,
      id,
      hostname: slotHostname(id),
      port: Math.max(1, Math.min(65535, Number(incoming?.port ?? base.port) || base.port)),
      enabled: Boolean(incoming?.enabled),
      host: String(incoming?.host ?? '').trim(),
      label: String(incoming?.label ?? base.label).trim() || base.label,
      note: incoming?.note?.trim() || undefined,
    };
  });

  await SystemConfig.setConfig(CONFIG_KEY_SLOTS, normalized, 'json', CONFIG_CATEGORY);
  return normalized;
}

export async function clearSlot(id: DevSlotId): Promise<DevSlotConfig[]> {
  const slots = await loadSlots();
  const next = slots.map((s) =>
    s.id === id ? { ...s, host: '', enabled: false, note: undefined } : s
  );
  return saveSlots(next);
}

function emptyHealth(): DevSlotHealth {
  return {
    status: 'unknown',
    lastCheck: null,
    latencyMs: null,
    error: null,
    downSince: null,
  };
}

export async function loadHealth(): Promise<Record<DevSlotId, DevSlotHealth>> {
  const stored = await SystemConfig.getConfig<Record<string, DevSlotHealth>>(CONFIG_KEY_HEALTH, null);
  const defaults: Record<DevSlotId, DevSlotHealth> = {
    dev1: emptyHealth(),
    dev2: emptyHealth(),
    dev3: emptyHealth(),
  };
  if (!stored) return defaults;
  for (const id of DEV_SLOT_IDS) {
    defaults[id] = { ...emptyHealth(), ...stored[id] };
  }
  return defaults;
}

export async function saveHealth(health: Record<DevSlotId, DevSlotHealth>): Promise<void> {
  await SystemConfig.setConfig(CONFIG_KEY_HEALTH, health, 'json', CONFIG_CATEGORY);
}

export async function loadAlerts(): Promise<DevToolboxAlert[]> {
  const stored = await SystemConfig.getConfig<DevToolboxAlert[]>(CONFIG_KEY_ALERTS, []);
  return Array.isArray(stored) ? stored.slice(0, 50) : [];
}

export async function saveAlerts(alerts: DevToolboxAlert[]): Promise<void> {
  await SystemConfig.setConfig(CONFIG_KEY_ALERTS, alerts.slice(0, 50), 'json', CONFIG_CATEGORY);
}

export async function loadMeta(): Promise<{ lastApplyAt: string | null; lastApplyMessage: string | null }> {
  return (
    (await SystemConfig.getConfig<{ lastApplyAt: string | null; lastApplyMessage: string | null }>(
      CONFIG_KEY_META,
      { lastApplyAt: null, lastApplyMessage: null }
    )) ?? { lastApplyAt: null, lastApplyMessage: null }
  );
}

export async function saveMeta(meta: { lastApplyAt: string | null; lastApplyMessage: string | null }) {
  await SystemConfig.setConfig(CONFIG_KEY_META, meta, 'json', CONFIG_CATEGORY);
}

export async function getToolboxState(): Promise<DevToolboxState> {
  const [slots, health, alerts, meta] = await Promise.all([
    loadSlots(),
    loadHealth(),
    loadAlerts(),
    loadMeta(),
  ]);

  return {
    slots,
    health,
    alerts,
    tunnel: getTunnelMeta(),
    lastApplyAt: meta.lastApplyAt,
    lastApplyMessage: meta.lastApplyMessage,
  };
}

export async function runCloudflared(args: string[], timeoutMs = 60_000): Promise<string> {
  const exe = getTunnelMeta().cloudflaredExe;
  if (!exe) throw new Error('cloudflared.exe not found on this server');

  const { stdout, stderr } = await execFileAsync(exe, args, {
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}

async function isCloudflaredRunning(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'tasklist',
      ['/FI', 'IMAGENAME eq cloudflared.exe', '/FO', 'CSV', '/NH'],
      { windowsHide: true }
    );
    return /cloudflared\.exe/i.test(stdout);
  } catch {
    return false;
  }
}

async function waitForCloudflared(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isCloudflaredRunning()) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

function getRestartTunnelScriptPath(): string {
  return path.join(getMonorepoRoot(), 'scripts', 'restart-cloudflared-tunnel.bat');
}

export async function restartCloudflaredTunnel(): Promise<string> {
  const { cloudflaredExe, configPath } = getTunnelMeta();
  if (!cloudflaredExe) {
    throw new DeveloperToolboxError('cloudflared.exe not found on this server');
  }

  if (process.platform === 'win32') {
    const scriptPath = getRestartTunnelScriptPath();
    if (!fs.existsSync(scriptPath)) {
      throw new DeveloperToolboxError(`Restart script not found: ${scriptPath}`);
    }

    await execFileAsync('cmd.exe', ['/c', scriptPath], {
      windowsHide: true,
      timeout: 30_000,
      cwd: getMonorepoRoot(),
    });
  } else {
    try {
      await execFileAsync('pkill', ['-f', 'cloudflared tunnel'], { timeout: 10_000 });
    } catch {
      // not running
    }

    await new Promise((r) => setTimeout(r, 2000));

    await new Promise<void>((resolve, reject) => {
      const child = spawn(cloudflaredExe, ['tunnel', '--config', configPath, 'run'], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.on('error', reject);
      child.unref();
      resolve();
    });
  }

  if (!(await waitForCloudflared())) {
    throw new DeveloperToolboxError(
      'Tunnel was stopped but cloudflared did not come back up. Run start.bat on the demo PC, or start the tunnel manually from the Cloudflare Tunnel window.'
    );
  }

  return 'Cloudflare tunnel restarted';
}

export async function ensureDnsRoutes(slots: DevSlotConfig[]): Promise<string[]> {
  const messages: string[] = [];
  const active = slots.filter((s) => s.enabled && s.host.trim());

  for (const slot of active) {
    try {
      const out = await runCloudflared(['tunnel', 'route', 'dns', TUNNEL_ID, slot.hostname]);
      messages.push(`${slot.hostname}: ${out || 'DNS route OK'}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/already exists|record already|1003/i.test(msg)) {
        messages.push(`${slot.hostname}: DNS already configured`);
      } else {
        messages.push(`${slot.hostname}: DNS warning — ${msg}`);
      }
    }
  }

  return messages;
}

export async function applyToolbox(slots: DevSlotConfig[]): Promise<{ message: string }> {
  const saved = await saveSlots(slots);
  const { backupPath } = writeTunnelConfigFromSlots(saved);
  const dnsMessages = await ensureDnsRoutes(saved);
  const restartMessage = await restartCloudflaredTunnel();
  const miniMessage = await ensureDockedMiniRunning();

  const message = [
    `Config updated (backup: ${backupPath})`,
    ...dnsMessages,
    restartMessage,
    ...(miniMessage ? [miniMessage] : []),
  ].join('\n');

  await saveMeta({
    lastApplyAt: new Date().toISOString(),
    lastApplyMessage: message,
  });

  return { message };
}

export async function acknowledgeAlerts(ids?: string[]) {
  const alerts = await loadAlerts();
  const next = alerts.map((a) =>
    !ids || ids.length === 0 || ids.includes(a.id) ? { ...a, acknowledged: true } : a
  );
  await saveAlerts(next);
  return next;
}
