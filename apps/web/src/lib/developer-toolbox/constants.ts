import type { DevSlotConfig, DevSlotId } from './types';

export const DEV_SLOT_IDS: DevSlotId[] = ['dev1', 'dev2', 'dev3'];

export const TUNNEL_ID = 'cdcb0769-874b-4923-aeed-a493e1a2b6af';
export const TUNNEL_NAME = 'computerdynamics-tunnel';
export const DOMAIN = 'computerdynamicstt.com';

export const CONFIG_KEY_SLOTS = 'developer_toolbox_slots';
export const CONFIG_KEY_HEALTH = 'developer_toolbox_health';
export const CONFIG_KEY_ALERTS = 'developer_toolbox_alerts';
export const CONFIG_KEY_META = 'developer_toolbox_meta';
export const CONFIG_CATEGORY = 'developer_toolbox';

export const YAML_MARKER_START = '# --- Developer Toolbox (portal-managed) ---';
export const YAML_MARKER_END = '# --- end Developer Toolbox ---';

export function defaultSlots(): DevSlotConfig[] {
  return [
    {
      id: 'dev1',
      label: 'Dev 1',
      hostname: `dev1.${DOMAIN}`,
      host: '192.168.131.121',
      port: 7755,
      enabled: true,
      note: 'Event Sponsor CRM',
    },
    {
      id: 'dev2',
      label: 'Dev 2',
      hostname: `dev2.${DOMAIN}`,
      host: '',
      port: 3000,
      enabled: false,
    },
    {
      id: 'dev3',
      label: 'Dev 3',
      hostname: `dev3.${DOMAIN}`,
      host: '',
      port: 8080,
      enabled: false,
    },
  ];
}
