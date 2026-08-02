import { NextRequest } from 'next/server';
import { proxyToLicenseApi } from '@/lib/license-api-proxy';
import {
  guardLicenseValidateRequest,
  logLicenseValidateResult,
} from '@/lib/license-validate-guard';

/** Public license validation — direct to Flask (bypasses Express so tsx watch restarts don't 503). */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const blocked = await guardLicenseValidateRequest(request, body);
  if (blocked) return blocked;

  const response = await proxyToLicenseApi('/api/license/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const responseText = await response.text();
  await logLicenseValidateResult(request, body, responseText, response.status);
  return new Response(responseText, {
    status: response.status,
    headers: { 'Content-Type': response.headers.get('content-type') ?? 'application/json' },
  });
}
