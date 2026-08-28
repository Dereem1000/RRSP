import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';

const OVERRIDES_FILE = 'marketing-image-overrides.json';
const PUBLIC_OVERRIDES_DIR = path.join('images', 'marketing-overrides');

export function marketingOverridesPath() {
  return path.join(getMonorepoRoot(), 'data', OVERRIDES_FILE);
}

export function marketingOverridesPublicDir() {
  return path.join(getMonorepoRoot(), 'apps', 'web', 'public', PUBLIC_OVERRIDES_DIR);
}

export function normalizeMarketingSlot(raw: string): string | null {
  let value = String(raw || '').trim().replace(/\\/g, '/');
  if (!value) return null;
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      value = url.pathname;
    }
  } catch {
    return null;
  }
  value = value.replace(/^\/+/, '');
  value = decodeURIComponent(value);
  if (value.startsWith('images/marketing-overrides/')) {
    return null;
  }
  if (!value.startsWith('images/') && value !== 'logo.png') {
    return null;
  }
  if (value.includes('..')) return null;
  return value;
}

export type MarketingImageOverrides = Record<string, string>;

export function readMarketingImageOverrides(): MarketingImageOverrides {
  const file = marketingOverridesPath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: MarketingImageOverrides = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const slot = normalizeMarketingSlot(key);
      if (!slot || typeof value !== 'string') continue;
      const href = value.trim();
      if (!href.startsWith('/images/marketing-overrides/')) continue;
      out[slot] = href;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeMarketingImageOverrides(map: MarketingImageOverrides) {
  const file = marketingOverridesPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

export function extensionForUpload(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  if (mimeType === 'image/svg+xml') return '.svg';
  return '.jpg';
}

export function saveMarketingImageUpload(input: {
  slot: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): { slot: string; url: string } {
  const slot = normalizeMarketingSlot(input.slot);
  if (!slot) throw new Error('Invalid image slot');

  const ext = extensionForUpload(input.fileName, input.mimeType);
  const safeBase = slot
    .replace(/^images\//, '')
    .replace(/[^a-zA-Z0-9/_-]+/g, '-')
    .replace(/\/+/g, '__');
  const fileName = `${safeBase}-${Date.now()}${ext}`;
  const dir = marketingOverridesPublicDir();
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, fileName);
  fs.writeFileSync(abs, input.buffer);

  const url = `/${PUBLIC_OVERRIDES_DIR.replace(/\\/g, '/')}/${fileName}`.replace(/\/+/g, '/');
  const map = readMarketingImageOverrides();
  const previous = map[slot];
  map[slot] = url;
  writeMarketingImageOverrides(map);

  if (previous && previous.startsWith('/images/marketing-overrides/')) {
    const prevAbs = path.join(getMonorepoRoot(), 'apps', 'web', 'public', previous.replace(/^\//, ''));
    if (fs.existsSync(prevAbs) && prevAbs !== abs) {
      try {
        fs.unlinkSync(prevAbs);
      } catch {
        /* ignore stale cleanup */
      }
    }
  }

  return { slot, url };
}
