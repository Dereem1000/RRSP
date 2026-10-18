/** Client-safe: normalize catalog image URLs for CD-hosted media (no Node fs). */

const UPLOADS_PRODUCTS_PREFIX = '/uploads/products/';
const CD_MEDIA_FILE_PREFIX = '/api/pos-catalog-media/file/';

function fileBaseName(segment: string): string {
  const parts = segment.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}

/** Extract the product image file name from POS or CD catalog URL forms. */
export function parseCatalogImageFileName(imageUrl: string | undefined | null): string | null {
  const raw = String(imageUrl || '').trim();
  if (!raw) return null;

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return parseCatalogImageFileName(u.pathname);
    } catch {
      return null;
    }
  }

  let pathPart = raw.split('?')[0].replace(/\\/g, '/');
  if (!pathPart.startsWith('/')) pathPart = `/${pathPart}`;

  if (pathPart.startsWith(CD_MEDIA_FILE_PREFIX)) {
    const rest = pathPart.slice(CD_MEDIA_FILE_PREFIX.length);
    const decoded = decodeURIComponent(rest.split('/')[0] || '');
    return decoded || null;
  }

  if (pathPart.toLowerCase().startsWith(UPLOADS_PRODUCTS_PREFIX.toLowerCase())) {
    const rest = pathPart.slice(UPLOADS_PRODUCTS_PREFIX.length);
    const base = fileBaseName(rest);
    return base || null;
  }

  if (!pathPart.includes('/')) {
    return fileBaseName(pathPart);
  }

  return null;
}

/**
 * URL the CD web app can load in <img src> — via pos-catalog-media API when a file name is known.
 * Files are read from data/pos-catalog-media and/or symlinked data/pos-catalog-uploads/products.
 */
export function catalogImageUrlToCdServeUrl(imageUrl: string | undefined | null): string | null {
  const raw = String(imageUrl || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith(CD_MEDIA_FILE_PREFIX)) {
    const base = raw.split('?')[0];
    return base.includes('kind=') ? raw : `${base}?kind=image`;
  }

  const fileName = parseCatalogImageFileName(raw);
  if (!fileName) {
    if (raw.startsWith('/')) return raw;
    return null;
  }

  return `${CD_MEDIA_FILE_PREFIX}${encodeURIComponent(fileName)}?kind=image`;
}

export function resolveCanonicalImageSrc(imageUrl: string | undefined | null): string | null {
  return catalogImageUrlToCdServeUrl(imageUrl);
}
