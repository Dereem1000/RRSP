// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import {
  getFederationImageSearchSettingsForAdmin,
  saveFederationImageSearchSettings,
} from '@cd-v2/security';

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const settings = await getFederationImageSearchSettingsForAdmin();
    return { status: 200, body: { success: true, settings } };
  } catch (error) {
    return authErrorResult(error);
  }
}

function validationErrorResult(error: unknown): ApiResult {
  const message = error instanceof Error ? error.message : 'Invalid federation image search settings';
  return { status: 400, body: { success: false, message } };
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const body = ctx.body as Record<string, unknown>;
    const providerRaw = body.provider !== undefined ? String(body.provider).trim().toLowerCase() : undefined;
    const provider =
      providerRaw === 'brave' || providerRaw === 'google' ? providerRaw : undefined;

    await saveFederationImageSearchSettings({
      provider,
      apiKey: body.apiKey !== undefined ? String(body.apiKey) : undefined,
      searchEngineId:
        body.searchEngineId !== undefined ? String(body.searchEngineId) : undefined,
      braveApiKey: body.braveApiKey !== undefined ? String(body.braveApiKey) : undefined,
    });

    const settings = await getFederationImageSearchSettingsForAdmin();
    const hint =
      settings.provider === 'brave'
        ? 'add your Brave Search API subscription token'
        : 'add both Google API key and Search Engine ID (cx)';
    return {
      status: 200,
      body: {
        success: true,
        settings,
        message: settings.ready
          ? `Federation image search ready (${settings.provider === 'brave' ? 'Brave' : 'Google'})`
          : `Saved — ${hint} to enable federation image search`,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('Programmable Search') ||
      message.includes('Search Engine ID') ||
      message.includes('Brave Search') ||
      message.startsWith('API key should')
    ) {
      return validationErrorResult(error);
    }
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
