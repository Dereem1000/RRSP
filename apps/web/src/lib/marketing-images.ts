import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';

const OVERRIDES_FILE = 'marketing-image-overrides.json';
const DISPLAY_FILE = 'marketing-image-display.json';
const PUBLIC_OVERRIDES_DIR = path.join('images', 'marketing-overrides');

export type MarketingImageDisplay = {
  objectFit?: 'cover' | 'contain';
  posX?: number;
  posY?: number;
  heroHeight?: number;
  showcaseMaxHeight?: number;
  scale?: number;
};

export type MarketingImageDisplayMap = Record<string, MarketingImageDisplay>;

export function marketingDisplayPath() {
  return path.join(getMonorepoRoot(), 'data', DISPLAY_FILE);
}

export function marketingOverridesPath() {
  return path.join(getMonorepoRoot(), 'data', OVERRIDES_FILE);
}

/** Public root for the web app that is serving requests (Next cwd), not always monorepo apps/web. */
export function marketingWebPublicRoot(): string {
  const cwdNorm = process.cwd().replace(/\\/g, '/');
  if (cwdNorm.endsWith('/apps/web')) {
    return path.join(process.cwd(), 'public');
  }
  return path.join(getMonorepoRoot(), 'apps', 'web', 'public');
}

export function marketingOverridesPublicDir() {
  return path.join(marketingWebPublicRoot(), PUBLIC_OVERRIDES_DIR);
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

function clampNum(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function sanitizeMarketingImageDisplay(raw: unknown): MarketingImageDisplay | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const input = raw as Record<string, unknown>;
  const out: MarketingImageDisplay = {};
  if (input.objectFit === 'cover' || input.objectFit === 'contain') {
    out.objectFit = input.objectFit;
  }
  if ('posX' in input) out.posX = clampNum(input.posX, 0, 100, 50);
  if ('posY' in input) out.posY = clampNum(input.posY, 0, 100, 50);
  if ('heroHeight' in input) out.heroHeight = clampNum(input.heroHeight, 120, 420, 220);
  if ('showcaseMaxHeight' in input) out.showcaseMaxHeight = clampNum(input.showcaseMaxHeight, 280, 900, 640);
  if ('scale' in input) out.scale = clampNum(input.scale, 1, 2, 1);
  return Object.keys(out).length ? out : null;
}

export function readMarketingImageDisplay(): MarketingImageDisplayMap {
  const file = marketingDisplayPath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: MarketingImageDisplayMap = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const slot = normalizeMarketingSlot(key);
      const display = sanitizeMarketingImageDisplay(value);
      if (!slot || !display) continue;
      out[slot] = display;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeMarketingImageDisplay(map: MarketingImageDisplayMap) {
  const file = marketingDisplayPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
}

export function saveMarketingImageDisplay(input: {
  slot: string;
  display: MarketingImageDisplay | null;
}): { slot: string; display: MarketingImageDisplay | null } {
  const slot = normalizeMarketingSlot(input.slot);
  if (!slot) throw new Error('Invalid image slot');
  const map = readMarketingImageDisplay();
  if (!input.display || !Object.keys(input.display).length) {
    delete map[slot];
  } else {
    const cleaned = sanitizeMarketingImageDisplay(input.display);
    if (!cleaned) {
      delete map[slot];
    } else {
      map[slot] = cleaned;
    }
  }
  writeMarketingImageDisplay(map);
  return { slot, display: map[slot] ?? null };
}

const OVERRIDE_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

/** Resolve a marketing override file on disk (active web public dir, then monorepo fallback). */
export function resolveMarketingOverrideFile(fileName: string): { abs: string; mime: string } | null {
  const safe = path.basename(String(fileName || '').trim());
  if (!safe || safe.includes('..') || safe.startsWith('.')) return null;

  const ext = path.extname(safe).toLowerCase();
  const mime = OVERRIDE_MIME[ext];
  if (!mime) return null;

  const candidates = [
    path.join(marketingOverridesPublicDir(), safe),
    path.join(getMonorepoRoot(), 'apps', 'web', 'public', PUBLIC_OVERRIDES_DIR, safe),
  ];
  for (const abs of candidates) {
    if (fs.existsSync(abs)) return { abs, mime };
  }
  return null;
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
    const prevAbs = path.join(marketingWebPublicRoot(), previous.replace(/^\//, ''));
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
