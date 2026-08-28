// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult } from '@cd-v2/api-handlers';

import { getLicenseApiInternalBase } from '@web/lib/license-api-proxy';
import {
  guardLicenseValidateRequestFromCtx,
  logLicenseValidateResultFromCtx,
} from '@web/lib/license-validate-guard';

const LICENSE_VALIDATE_TIMEOUT_MS = 12_000;
const LICENSE_VALIDATE_RETRIES = 4;
const LICENSE_VALIDATE_RETRY_BASE_MS = 300;

function bodyTextFromCtx(ctx: ApiContext): string {
  if (typeof ctx.body === 'string') return ctx.body;
  if (ctx.body === undefined || ctx.body === null) return '';
  return JSON.stringify(ctx.body);
}

function parseProxyResponse(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function isTransientLicenseFetchError(error: unknown): boolean {
  if (error instanceof Error && error.name === 'TimeoutError') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|ECONNREFUSED|ECONNRESET|EADDRNOTAVAIL|socket hang up|network|aborted|timeout/i.test(
    message
  );
}

async function fetchLicenseValidate(url: string, body: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < LICENSE_VALIDATE_RETRIES; attempt++) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
        signal: AbortSignal.timeout(LICENSE_VALIDATE_TIMEOUT_MS),
      });
    } catch (error) {
      lastError = error;
      if (!isTransientLicenseFetchError(error) || attempt === LICENSE_VALIDATE_RETRIES - 1) {
        throw error;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, LICENSE_VALIDATE_RETRY_BASE_MS * (attempt + 1))
      );
    }
  }
  throw lastError;
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  const body = bodyTextFromCtx(ctx);
  const blocked = await guardLicenseValidateRequestFromCtx(ctx, body);
  if (blocked) return blocked;

  const url = `${getLicenseApiInternalBase()}/api/license/validate`;
  try {
    const res = await fetchLicenseValidate(url, body);
    const responseText = await res.text();
    await logLicenseValidateResultFromCtx(ctx, body, responseText, res.status);
    return {
      status: res.status,
      body: parseProxyResponse(responseText),
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'application/json',
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'License API unavailable';
    await logLicenseValidateResultFromCtx(
      ctx,
      body,
      JSON.stringify({ success: false, valid: false }),
      503
    );
    return {
      status: 503,
      body: {
        success: false,
        valid: false,
        error: 'License API unavailable',
        message: `${message}. Ensure the license API is running.`,
      },
    };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
