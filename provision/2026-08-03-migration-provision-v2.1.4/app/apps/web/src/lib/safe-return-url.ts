/** Internal portal paths safe to use after login (blocks open redirects). */
export function isSafeReturnPath(path: string | null | undefined): path is string {
  if (!path || !path.startsWith('/') || path.startsWith('//')) return false;
  if (path.startsWith('/login')) return false;
  return true;
}

export function resolveReturnPath(path: string | null | undefined, fallback = '/dashboard'): string {
  return isSafeReturnPath(path) ? path : fallback;
}

export function buildLoginRedirectUrl(returnPath?: string | null): string {
  if (!isSafeReturnPath(returnPath)) return '/login';
  return `/login?returnUrl=${encodeURIComponent(returnPath)}`;
}
