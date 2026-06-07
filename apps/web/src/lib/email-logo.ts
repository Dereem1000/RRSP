import fs from 'fs';
import path from 'path';
import type { Attachment } from 'nodemailer/lib/mailer';

export const EMAIL_LOGO_CID = 'company-logo@cd-portal';

export type EmailLogoResult = {
  imgSrc: string | null;
  attachment?: Attachment;
};

const RASTER_DATA_URL =
  /^data:(image\/(?:png|jpeg|jpg|gif|webp));base64,([a-zA-Z0-9+/=\r\n]+)$/i;

function cidAttachment(
  content: Buffer,
  contentType: string,
  filename: string
): EmailLogoResult {
  return {
    imgSrc: `cid:${EMAIL_LOGO_CID}`,
    attachment: {
      filename,
      content,
      cid: EMAIL_LOGO_CID,
      contentType,
    },
  };
}

function publicDir() {
  return path.join(process.cwd(), 'public');
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/i);
  if (base64Match) {
    return Buffer.from(base64Match[1].replace(/\s/g, ''), 'base64');
  }
  const uriMatch = dataUrl.match(/^data:[^;]+,(.+)$/i);
  if (uriMatch) {
    return Buffer.from(decodeURIComponent(uriMatch[1]), 'utf8');
  }
  return null;
}

function readPublicFile(relativePath: string): EmailLogoResult | null {
  const normalized = relativePath.replace(/^\/+/, '');
  const filePath = path.join(publicDir(), normalized);
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath);

  if (ext === '.svg') {
    return cidAttachment(content, 'image/svg+xml', path.basename(filePath));
  }

  const contentType =
    ext === '.png'
      ? 'image/png'
      : ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : null;
  if (!contentType) return null;

  return cidAttachment(content, contentType, path.basename(filePath));
}

function resolvePublicLogoPath(logoPath: string): string {
  if (logoPath === '/logo.png' && !fs.existsSync(path.join(publicDir(), 'logo.png'))) {
    return '/logo.svg';
  }
  return logoPath;
}

/** Embed the configured company logo inline so email clients don't need to fetch localhost URLs. */
export async function prepareEmailLogo(logo: string | undefined | null): Promise<EmailLogoResult> {
  const fallback = readPublicFile('logo.svg');

  if (!logo?.trim()) {
    return fallback ?? { imgSrc: null };
  }

  const trimmed = logo.trim();

  const rasterMatch = trimmed.match(RASTER_DATA_URL);
  if (rasterMatch) {
    const contentType = rasterMatch[1].toLowerCase();
    const buffer = Buffer.from(rasterMatch[2].replace(/\s/g, ''), 'base64');
    if (buffer.length > 0) {
      const ext = contentType.includes('jpeg') || contentType.includes('jpg') ? 'jpg' : 'png';
      return cidAttachment(buffer, contentType, `logo.${ext}`);
    }
  }

  if (trimmed.startsWith('data:image/svg')) {
    const buffer = dataUrlToBuffer(trimmed);
    if (buffer?.length) {
      return cidAttachment(buffer, 'image/svg+xml', 'logo.svg');
    }
    return fallback ?? { imgSrc: null };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const res = await fetch(trimmed, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const contentType = (res.headers.get('content-type') || 'application/octet-stream')
          .split(';')[0]
          .trim();
        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > 0) {
          const ext = contentType.includes('svg')
            ? 'svg'
            : contentType.includes('jpeg') || contentType.includes('jpg')
              ? 'jpg'
              : 'png';
          return cidAttachment(buffer, contentType, `logo.${ext}`);
        }
      }
    } catch {
      // use public fallback below
    }
    return fallback ?? { imgSrc: null };
  }

  if (trimmed.startsWith('/')) {
    const resolved = resolvePublicLogoPath(trimmed);
    return readPublicFile(resolved) ?? fallback ?? { imgSrc: null };
  }

  return readPublicFile(trimmed) ?? fallback ?? { imgSrc: null };
}

export type BrandedEmailContent = {
  html: string;
  attachments: Attachment[];
};
