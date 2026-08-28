import { NextRequest } from 'next/server';
import { proxyToLicenseApi } from '@/lib/license-api-proxy';

/** Server-to-server account license lookup (requires API key from product installer). */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const auth = request.headers.get('Authorization');
  const apiKey = request.headers.get('X-API-Key');
  if (auth) headers.Authorization = auth;
  if (apiKey) headers['X-API-Key'] = apiKey;

  const response = await proxyToLicenseApi('/api/license/account-licenses', {
    method: 'POST',
    headers,
    body,
  });
  const responseText = await response.text();
  return new Response(responseText, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
  });
}
