// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { guardMiniApiRouteResult } from '../../mini-helpers';
import { MINI_READ_PROXY_TIMEOUT_MS, miniProxyRequest } from '@web/lib/mini-dock';
import { reconcilePendingProjectGuardLicenseEscalations } from '@web/lib/project-guard-license-action';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireSession(ctx);
    const guard = await guardMiniApiRouteResult();
    if (guard) return guard;
    // Fetch MSP sync status live — Mini's external-systems hydration cache can omit it,
    // which made Project Guard show "token not configured" while Settings showed in sync.
    const [result, mspStatus] = await Promise.all([
      miniProxyRequest(
        '/api/external-systems',
        { method: 'GET' },
        { timeoutMs: MINI_READ_PROXY_TIMEOUT_MS },
      ),
      miniProxyRequest(
        '/api/cd/msp-sync/status',
        { method: 'GET' },
        { timeoutMs: MINI_READ_PROXY_TIMEOUT_MS },
      ),
    ]);
    let body =
      result.body && typeof result.body === 'object' && !Array.isArray(result.body)
        ? { ...(result.body as Record<string, unknown>) }
        : {};
    const mspBody =
      mspStatus.body && typeof mspStatus.body === 'object' && !Array.isArray(mspStatus.body)
        ? (mspStatus.body as Record<string, unknown>)
        : null;
    if (mspStatus.ok && mspBody?.cd_msp_sync && typeof mspBody.cd_msp_sync === 'object') {
      body.cd_msp_sync = mspBody.cd_msp_sync;
    }

    // Mini→public MSP is often blocked by Cloudflare (Error 1010). Apply pending
    // baseline-tamper license deactivations here in the portal, then write back to Mini.
    if (result.ok) {
      body = await reconcilePendingProjectGuardLicenseEscalations(body, async (payload) => {
        const report = await miniProxyRequest(
          '/api/external-systems/project-guard/license-escalation-result',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          },
          { timeoutMs: MINI_READ_PROXY_TIMEOUT_MS, updateOnlineCache: false },
        );
        return { ok: report.ok, body: report.body };
      });
    }

    return { status: result.status, body };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

