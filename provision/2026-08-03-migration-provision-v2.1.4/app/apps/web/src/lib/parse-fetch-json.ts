function looksLikeHtml(text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

function friendlyNonJsonMessage(status: number): string {
  if (status === 401 || status === 403) {
    return 'Your session may have expired. Refresh the page and sign in again.';
  }
  if (status === 404) {
    return 'Mini API was not found. Redeploy or restart the CD portal, then try again.';
  }
  if (isTransientMiniHttpStatus(status)) {
    return 'Mini is temporarily unavailable or still starting up. Retrying automatically…';
  }
  return 'Portal returned an unexpected page instead of data. Refresh and try again.';
}

export function isTransientMiniHttpStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 524;
}

/** Parse a fetch Response as JSON with clear errors when proxies return HTML error pages. */
export async function parseFetchJsonResponse<T = Record<string, unknown>>(
  res: Response
): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    if (looksLikeHtml(text)) {
      throw new Error(friendlyNonJsonMessage(res.status));
    }
    throw new Error(text.slice(0, 200) || `Unexpected response (${res.status})`);
  }
}

export function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const record = data as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return fallback;
}
