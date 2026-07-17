export type DevSlotId = 'dev1' | 'dev2' | 'dev3';

export type DevSlotConfig = {
  id: DevSlotId;
  label: string;
  hostname: string;
  host: string;
  port: number;
  enabled: boolean;
  note?: string;
};

export type DevSlotHealth = {
  status: 'up' | 'down' | 'unknown' | 'cleared';
  lastCheck: string | null;
  latencyMs: number | null;
  error: string | null;
  downSince: string | null;
};

export type DevToolboxAlert = {
  id: string;
  slotId: DevSlotId;
  hostname: string;
  message: string;
  level: 'warning' | 'error' | 'info';
  createdAt: string;
  acknowledged: boolean;
};

export type DevToolboxState = {
  slots: DevSlotConfig[];
  health: Record<DevSlotId, DevSlotHealth>;
  alerts: DevToolboxAlert[];
  tunnel: {
    id: string;
    name: string;
    configPath: string;
    cloudflaredExe: string | null;
  };
  lastApplyAt: string | null;
  lastApplyMessage: string | null;
};
