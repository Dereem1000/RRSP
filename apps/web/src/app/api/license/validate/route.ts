import { NextRequest } from 'next/server';
import { getLicenseApiInternalBase } from '@/lib/license-api-proxy';
import {
  guardLicenseValidateRequest,
  logLicenseValidateResult,
} from '@/lib/license-validate-guard';

/** Public license validation — proxied to Flask with security guards. */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const blocked = await guardLicenseValidateRequest(request, body);
  if (blocked) return blocked;

  const url = `${getLicenseApiInternalBase()}/api/license/validate`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      cache: 'no-store',
    });
    const responseText = await res.text();
    await logLicenseValidateResult(request, body, responseText, res.status);
    return new Response(responseText, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'License API unavailable';
    await logLicenseValidateResult(request, body, JSON.stringify({ success: false, valid: false }), 503);
    return Response.json(
      {
        success: false,
        valid: false,
        error: 'License API unavailable',
        message: `${message}. Ensure the license API is running.`,
      },
      { status: 503 }
    );
  }
}
