// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult } from '@cd-v2/api-handlers';
import {
  ACTIVATION_FEATURES,
  type ActivationFeature,
} from '@web/lib/license-constants';
import {
  contentTypeForInstaller,
  getProductInstallerInfo,
  readInstallerFile,
  resolveMarketingPageInstaller,
} from '@web/lib/product-installer';
import { getPublicInstallerManifestCached } from '@web/lib/product-installer-manifest';

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
  const params = searchParamsFrom(ctx);
  const pathKey = String(ctx.path || ctx.urlPath || '');
  if (pathKey.includes('/manifest') || params.get('manifest') === '1') {
    const manifest = await getPublicInstallerManifestCached();
    return {
      status: 200,
      headers: { 'Cache-Control': 'public, max-age=30' },
      body: { success: true, ...manifest },
    };
  }

  const page = params.get('page')?.trim();
  const download =
    params.get('download') === '1' ||
    pathKey.includes('/download');

  let feature = parseFeature(params.get('feature'));
  let info = feature ? await getProductInstallerInfo(feature) : null;

  if (!info && page) {
    info = await resolveMarketingPageInstaller(page);
    feature = info?.feature ?? null;
  }

  if (!info || !feature) {
    return { status: 404, body: { success: false, message: 'Installer not configured' } };
  }

  if (!info.available) {
    return { status: 404, body: { success: false, message: 'Installer file not found', feature } };
  }

  if (download) {
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
  }

  const downloadUrl = `/api/public/product-installer/download?feature=${encodeURIComponent(feature)}`;
  return {
    status: 200,
    body: {
      success: true,
      available: true,
      feature,
      fileName: info.fileName,
      sizeBytes: info.sizeBytes,
      downloadUrl,
    },
  };
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
