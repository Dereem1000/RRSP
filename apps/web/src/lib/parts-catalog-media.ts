import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getMonorepoRoot } from '@cd-v2/database';

const MEDIA_DIR = 'parts-catalog-media';

const IMAGE_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const VIDEO_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

function mediaRoot() {
  return path.join(getMonorepoRoot(), 'data', MEDIA_DIR);
}

function extensionForUpload(fileName: string, mimeType: string, kind: 'image' | 'video'): string {
  const fromName = path.extname(fileName || '').toLowerCase();
  if (kind === 'image') {
    if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(fromName)) {
      return fromName === '.jpeg' ? '.jpg' : fromName;
    }
    if (mimeType === 'image/png') return '.png';
    if (mimeType === 'image/webp') return '.webp';
    if (mimeType === 'image/gif') return '.gif';
    return '.jpg';
  }
  if (['.mp4', '.webm', '.mov'].includes(fromName)) return fromName;
  if (mimeType === 'video/webm') return '.webm';
  if (mimeType === 'video/quicktime') return '.mov';
  return '.mp4';
}

export function savePartsCatalogMediaUpload(input: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  kind: 'image' | 'video';
}): { fileName: string } {
  const kind = input.kind;
  const ext = extensionForUpload(input.fileName, input.mimeType, kind);
  const prefix = kind === 'image' ? 'img' : 'vid';
  const fileName = `${prefix}-${randomUUID()}${ext}`;
  const dir = mediaRoot();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, fileName), input.buffer);
  return { fileName };
}

export function resolvePartsCatalogMediaFile(
  fileName: string,
  kind: 'image' | 'video'
): { abs: string; mime: string } | null {
  const safe = path.basename(String(fileName || '').trim());
  if (!safe || safe.includes('..') || safe.startsWith('.')) return null;
  const ext = path.extname(safe).toLowerCase();
  const mime = kind === 'image' ? IMAGE_EXT[ext] : VIDEO_EXT[ext];
  if (!mime) return null;
  const abs = path.join(mediaRoot(), safe);
  if (!fs.existsSync(abs)) return null;
  return { abs, mime };
}
