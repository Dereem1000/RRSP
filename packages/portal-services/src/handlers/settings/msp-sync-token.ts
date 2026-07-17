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

import {
  generateMspSyncToken,
  getMspSyncTokenSettings,
  getMspSyncEnvOverrideMessage,
  saveMspSyncToken,
} from '@web/lib/msp-sync-token';
import { getMiniMspSyncStatus } from '@web/lib/mini-msp-sync';


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
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const settings = await getMspSyncTokenSettings();
    const miniSync = await getMiniMspSyncStatus();
    return { status: 200, body: {
      success: true,
      settings,
      miniSync,
      envOverrideMessage: getMspSyncEnvOverrideMessage(settings.envOverride),
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const token = generateMspSyncToken();
    const result = await saveMspSyncToken(token, body.mspApiUrl);
    const envMsg = getMspSyncEnvOverrideMessage(result.envOverride);

    return { status: 200, body: {
      success: true,
      token,
      tokenPreview: result.tokenPreview,
      licenseDbSynced: result.licenseDbSynced,
      message: envMsg
        ? `New token generated and saved. ${envMsg}`
        : 'New sync token generated. Copy it now — it will not be shown again in full.',
      envOverrideMessage: envMsg,
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate token';
    return { status: 400, body: { success: false, message } };
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const body = ctx.body as Record<string, unknown>;
    const token = String(body.token ?? '').trim();
    if (!token) {
      return { status: 400, body: { success: false, message: 'Token is required' } };
    }

    const result = await saveMspSyncToken(token, body.mspApiUrl);
    const envMsg = getMspSyncEnvOverrideMessage(result.envOverride);

    return { status: 200, body: {
      success: true,
      token,
      tokenPreview: result.tokenPreview,
      licenseDbSynced: result.licenseDbSynced,
      message: envMsg
        ? `Token saved. ${envMsg}`
        : 'Sync token updated. Copy it into the License Activation GUI if needed.',
      envOverrideMessage: envMsg,
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save token';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

