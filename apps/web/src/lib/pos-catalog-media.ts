import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getMonorepoRoot } from '@cd-v2/database';
import { parseCatalogImageFileName } from '@/lib/pos-catalog-image-url';

const MEDIA_DIR = 'pos-catalog-media';
const UPLOADS_DIR = 'pos-catalog-uploads';

const IMAGE_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function posCatalogMediaRoot() {
  const override = String(process.env.POS_CATALOG_MEDIA_ROOT || '').trim();
  if (override) return path.resolve(override);
  return path.join(getMonorepoRoot(), 'data', MEDIA_DIR);
}

/** Optional symlink/junction to POS `server/uploads/products` (CD source of truth layout). */
export function posCatalogUploadsProductsRoot() {
  const override = String(process.env.POS_CATALOG_UPLOADS_ROOT || '').trim();
  if (override) return path.resolve(override);
  return path.join(getMonorepoRoot(), 'data', UPLOADS_DIR, 'products');
}

export function posCatalogMediaPublicUrl(fileName: string): string {
  const safe = path.basename(String(fileName || '').trim());
  return `/api/pos-catalog-media/file/${encodeURIComponent(safe)}?kind=image`;
}

function resolvePosCatalogMediaFileAt(abs: string): { abs: string; mime: string } | null {
  const ext = path.extname(abs).toLowerCase();
  const mime = IMAGE_EXT[ext];
  if (!mime) return null;
  if (!fs.existsSync(abs)) return null;
  return { abs, mime };
}

function posCatalogExtraMediaRoots(): string[] {
  const roots: string[] = [];
  const posRoot = String(process.env.POS_SYSTEM_ROOT || '').trim();
  if (posRoot) {
    roots.push(path.join(path.resolve(posRoot), 'server', 'uploads', 'products'));
  }
  const extra = String(process.env.POS_CATALOG_EXTRA_MEDIA_DIRS || '').trim();
  if (extra) {
    for (const part of extra.split(/[;|]/)) {
      const p = part.trim();
      if (p) roots.push(path.resolve(p));
    }
  }
  return roots;
}

export function posCatalogImageProxyBases(): string[] {
  const raw = String(process.env.POS_CATALOG_IMAGE_PROXY_BASES || '').trim();
  const fromEnv = raw
    ? raw.split(/[,;]/).map((s) => s.trim().replace(/\/$/, '')).filter(Boolean)
    : [];
  return fromEnv;
}

export function resolvePosCatalogMediaFile(fileName: string): { abs: string; mime: string } | null {
  const safe = path.basename(String(fileName || '').trim());
  if (!safe || safe.includes('..') || safe.startsWith('.')) return null;

  const candidates = [
    path.join(posCatalogMediaRoot(), safe),
    path.join(posCatalogUploadsProductsRoot(), safe),
    ...posCatalogExtraMediaRoots().map((root) => path.join(root, safe)),
  ];

  for (const abs of candidates) {
    const hit = resolvePosCatalogMediaFileAt(abs);
    if (hit) return hit;
  }
  return null;
}

const MIME_BY_EXT = IMAGE_EXT;

function mimeForFileName(fileName: string): string | null {
  const ext = path.extname(fileName).toLowerCase();
  return MIME_BY_EXT[ext] || null;
}

async function fetchRemoteProductImage(
  baseUrl: string,
  fileName: string,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const base = baseUrl.replace(/\/$/, '');
  const url = `${base}/uploads/products/${encodeURIComponent(fileName)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const mime = response.headers.get('content-type')?.split(';')[0]?.trim() || mimeForFileName(fileName);
    if (!mime || !mime.startsWith('image/')) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) return null;
    return { buffer, mime };
  } catch {
    return null;
  }
}

let cachedFederationBases: { at: number; bases: string[] } | null = null;

async function federationPosImageBases(): Promise<string[]> {
  const now = Date.now();
  if (cachedFederationBases && now - cachedFederationBases.at < 60_000) {
    return cachedFederationBases.bases;
  }
  const bases: string[] = [];
  try {
    const { miniProxyRequest } = await import('@/lib/mini-dock');
    const result = await miniProxyRequest('/api/library/pos-catalog/connections', { method: 'GET' }, {
      timeoutMs: 10_000,
      updateOnlineCache: false,
    });
    if (result.ok && result.body && typeof result.body === 'object') {
      const connections = (result.body as { connections?: Array<{ crm_base_url?: string }> }).connections;
      if (Array.isArray(connections)) {
        for (const row of connections) {
          const url = String(row?.crm_base_url || '').trim().replace(/\/$/, '');
          if (url && !bases.includes(url)) bases.push(url);
        }
      }
    }
  } catch {
    // Mini not docked or unreachable — env proxy bases may still work.
  }
  cachedFederationBases = { at: now, bases };
  return bases;
}

/** Local disk first, then configured proxy bases, then federated POS connection URLs. */
export async function loadPosCatalogMediaBytes(
  fileName: string,
): Promise<{ buffer: Buffer; mime: string; source: 'disk' | 'remote' } | null> {
  const safe = path.basename(String(fileName || '').trim());
  if (!safe) return null;

  const local = resolvePosCatalogMediaFile(safe);
  if (local) {
    return { buffer: fs.readFileSync(local.abs), mime: local.mime, source: 'disk' };
  }

  const tried = new Set<string>();
  for (const base of posCatalogImageProxyBases()) {
    if (tried.has(base)) continue;
    tried.add(base);
    const remote = await fetchRemoteProductImage(base, safe);
    if (remote) return { ...remote, source: 'remote' };
  }

  for (const base of await federationPosImageBases()) {
    if (tried.has(base)) continue;
    tried.add(base);
    const remote = await fetchRemoteProductImage(base, safe);
    if (remote) return { ...remote, source: 'remote' };
  }

  return null;
}

/** Resolve a catalog JSON image_url (POS or CD form) to a readable file on disk. Follows symlinks. */
export function resolvePosCatalogMediaFromCatalogUrl(
  catalogImageUrl: string | undefined | null,
): { abs: string; mime: string; fileName: string } | null {
  const fileName = parseCatalogImageFileName(catalogImageUrl);
  if (!fileName) return null;
  const resolved = resolvePosCatalogMediaFile(fileName);
  if (!resolved) return null;
  return { ...resolved, fileName };
}

function extensionForPosCatalogImage(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName || '').toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) {
    return fromName === '.jpeg' ? '.jpg' : fromName;
  }
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/webp') return '.webp';
  if (mimeType === 'image/gif') return '.gif';
  return '.jpg';
}

export function savePosCatalogMediaUpload(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}): { fileName: string } {
  const ext = extensionForPosCatalogImage(input.fileName, input.mimeType);
  const safeName = `cat-${randomUUID()}${ext}`;
  const dir = posCatalogMediaRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, safeName), input.buffer);
  return { fileName: safeName };
}
