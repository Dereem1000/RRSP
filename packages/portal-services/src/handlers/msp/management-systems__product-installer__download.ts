// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import {
  ACTIVATION_FEATURES,
  type ActivationFeature,
} from '@web/lib/license-constants';
import {
  contentTypeForInstaller,
  getProductInstallerInfo,
  readInstallerFile,
} from '@web/lib/product-installer';

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
    const feature = parseFeature(searchParamsFrom(ctx).get('feature'));
    if (!feature) {
      return { status: 400, body: { success: false, message: 'Invalid product feature' } };
    }
    const info = await getProductInstallerInfo(feature);
    if (!info?.available) {
      return { status: 404, body: { success: false, message: 'Installer not available' } };
    }
    const buf = readInstallerFile(info.filePath);
    return {
      status: 200,
      rawBody: buf,
      headers: {
        'Content-Type': contentTypeForInstaller(info.fileName),
        'Content-Disposition': `attachment; filename="${info.fileName}"`,
        'Cache-Control': 'private, no-store',
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
