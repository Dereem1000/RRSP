/** Build CD portal URL for Mini Library proxy (`/api/mini/library/...`). */
export function buildMiniLibraryApiUrl(path: string): string {
  const trimmed = String(path || '').replace(/^\/+/, '');
  const qIndex = trimmed.indexOf('?');
  const pathPart = qIndex >= 0 ? trimmed.slice(0, qIndex) : trimmed;
  const queryPart = qIndex >= 0 ? trimmed.slice(qIndex) : '';
  const encodedPath = pathPart
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(decodeURIComponent(segment)))
    .join('/');
  return `/api/mini/library/${encodedPath}${queryPart}`;
}
