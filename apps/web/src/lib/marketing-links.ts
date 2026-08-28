import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';

const OVERRIDES_FILE = 'marketing-link-overrides.json';

export function marketingLinkOverridesPath() {
  return path.join(getMonorepoRoot(), 'data', OVERRIDES_FILE);
}

export function normalizeMarketingLinkSlot(raw: string): string | null {
  const value = String(raw || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!value || value.includes('..')) return null;
  if (!/^[a-z0-9][a-z0-9/_-]*$/i.test(value)) return null;
  return value;
}

export function normalizeMarketingLinkUrl(raw: string): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.href;
  } catch {
    return null;
  }
}

export type MarketingLinkOverrides = Record<string, string>;

export function readMarketingLinkOverrides(): MarketingLinkOverrides {
  const file = marketingLinkOverridesPath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: MarketingLinkOverrides = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const slot = normalizeMarketingLinkSlot(key);
      const href = typeof value === 'string' ? normalizeMarketingLinkUrl(value) : null;
      if (!slot || !href) continue;
      out[slot] = href;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeMarketingLinkOverrides(map: MarketingLinkOverrides) {
  const file = marketingLinkOverridesPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

export function saveMarketingLinkOverride(input: { slot: string; url: string }): { slot: string; url: string } {
  const slot = normalizeMarketingLinkSlot(input.slot);
  const url = normalizeMarketingLinkUrl(input.url);
  if (!slot) throw new Error('Invalid link slot');
  if (!url) throw new Error('Invalid URL — use http:// or https://');

  const map = readMarketingLinkOverrides();
  map[slot] = url;
  writeMarketingLinkOverrides(map);
  return { slot, url };
}
