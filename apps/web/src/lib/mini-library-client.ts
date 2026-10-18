import { buildMiniLibraryApiUrl } from '@/lib/mini-library-api';
import { apiErrorMessage, parseFetchJsonResponse } from '@/lib/parse-fetch-json';

export async function miniLibraryFetch<T>(path: string): Promise<T> {
  const res = await fetch(buildMiniLibraryApiUrl(path), {
    cache: 'no-store',
    credentials: 'include',
    headers: { 'Cache-Control': 'no-cache' },
  });
  const data = await parseFetchJsonResponse<T & { error?: string }>(res);
  if (!res.ok) throw new Error(apiErrorMessage(data, `Request failed (${res.status})`));
  return data as T;
}

export async function miniLibraryPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(buildMiniLibraryApiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await parseFetchJsonResponse<T & { error?: string }>(res);
  if (!res.ok) throw new Error(apiErrorMessage(data, `Request failed (${res.status})`));
  return data as T;
}
