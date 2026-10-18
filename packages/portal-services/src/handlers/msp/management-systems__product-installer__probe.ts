// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import {
  ACTIVATION_FEATURES,
  type ActivationFeature,
} from '@web/lib/license-constants';
import {
  getInstallerInfoForPath,
  resolveConfiguredInstallerPath,
} from '@web/lib/product-installer-paths';

function parseFeature(raw: unknown): ActivationFeature | null {
  const value = String(raw || '').trim();
  if (!value || !ACTIVATION_FEATURES.includes(value as ActivationFeature)) return null;
  return value as ActivationFeature;
}

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
    requireRole(session, 'admin', 'technician');
    const params = searchParamsFrom(ctx);
    const feature = parseFeature(params.get('feature'));
    if (!feature) {
      return { status: 400, body: { success: false, message: 'Invalid product feature' } };
    }
    const entry = {
      productInstallerPath: String(params.get('productInstallerPath') || '').trim(),
      projectRoot: String(params.get('projectRoot') || '').trim(),
    };
    const configuredPath = resolveConfiguredInstallerPath(entry, feature);
    const info = getInstallerInfoForPath(configuredPath, feature);
    return {
      status: 200,
      body: {
        success: true,
        feature,
        configuredPath,
        available: Boolean(info?.available),
        fileName: info?.fileName,
        resolvedPath: info?.available ? info.filePath : null,
        sizeBytes: info?.available ? info.sizeBytes : 0,
      },
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  if (ctx.method.toUpperCase() === 'GET') return GETHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
