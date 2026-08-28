import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';
import {
  DOMAIN,
  TUNNEL_ID,
  TUNNEL_NAME,
  YAML_MARKER_END,
  YAML_MARKER_START,
} from './constants';
import type { DevSlotConfig } from './types';

export function getTunnelConfigPath(): string {
  const root = getMonorepoRoot();
  const envPath = process.env.CD_TUNNEL_CONFIG?.trim();
  if (envPath && fs.existsSync(envPath)) return path.resolve(envPath);
  return path.join(root, 'cloudflared-computerdynamics.yml');
}

export function resolveCloudflaredExe(): string | null {
  const root = getMonorepoRoot();
  const candidates = [
    process.env.CD_CLOUDFLARED_EXE?.trim(),
    path.join(root, 'tools', 'cloudflared', 'cloudflared.exe'),
    'F:\\Computer Dynamics System\\repair_workspace\\repair_C.D_20251004_141630\\working\\tools\\cloudflared\\cloudflared.exe',
    'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
    'C:\\Program Files\\cloudflared\\cloudflared.exe',
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function buildDevIngressBlock(slots: DevSlotConfig[]): string {
  const lines: string[] = [YAML_MARKER_START];
  const active = slots.filter((s) => s.enabled && s.host.trim() && s.port > 0);

  if (active.length === 0) {
    lines.push('  # (no active dev routes — assign IP + port in Developer Toolbox)');
  }

  for (const slot of active) {
    const note = slot.note?.trim();
    if (note) lines.push(`  # ${slot.label}: ${note}`);
    lines.push(`  - hostname: ${slot.hostname}`);
    lines.push(`    service: http://${slot.host.trim()}:${slot.port}`);
  }

  lines.push(YAML_MARKER_END);
  return lines.join('\n');
}

export function readTunnelConfigText(): string {
  const configPath = getTunnelConfigPath();
  if (!fs.existsSync(configPath)) {
    throw new Error(`Tunnel config not found: ${configPath}`);
  }
  return fs.readFileSync(configPath, 'utf8');
}

export function writeTunnelConfigFromSlots(slots: DevSlotConfig[]): { configPath: string; backupPath: string } {
  const configPath = getTunnelConfigPath();
  let text = readTunnelConfigText();

  text = text.replace(
    new RegExp(`\\n?\\s*${escapeRegex(YAML_MARKER_START)}[\\s\\S]*?${escapeRegex(YAML_MARKER_END)}\\n?`, 'g'),
    '\n'
  );

  text = text.replace(
    /\n(?:  #[^\n]*\n)?  - hostname: dev[123]\.[^\n]+\n    service: http:\/\/[^\n]+/g,
    ''
  );

  const block = buildDevIngressBlock(slots);
  if (!text.includes('- service: http_status:404')) {
    throw new Error('Tunnel config missing catch-all http_status:404 ingress rule');
  }

  text = text.replace(/\n  - service: http_status:404/, `\n${block}\n  - service: http_status:404`);

  const backupPath = `${configPath}.bak-${Date.now()}`;
  fs.copyFileSync(configPath, backupPath);
  fs.writeFileSync(configPath, text.replace(/\n+$/, '\n'), 'utf8');

  return { configPath, backupPath };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getTunnelMeta() {
  return {
    id: TUNNEL_ID,
    name: TUNNEL_NAME,
    domain: DOMAIN,
    configPath: getTunnelConfigPath(),
    cloudflaredExe: resolveCloudflaredExe(),
  };
}
