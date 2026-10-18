import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';
import { ACTIVATION_FEATURES, type ActivationFeature } from '@/lib/license-constants';
import { MARKETING_PAGE_INSTALLER_FEATURES } from '@/lib/product-installer';
import { getProductInstallerInfo } from '@/lib/product-installer';

export type PublicInstallerManifestFeature = {
  available: true;
  fileName: string;
  downloadUrl: string;
  sizeBytes: number;
  sha256?: string;
};

export type PublicInstallerManifest = {
  generatedAt: string;
  features: Partial<Record<ActivationFeature, PublicInstallerManifestFeature>>;
  pages: Partial<Record<string, { feature: ActivationFeature; fileName: string; downloadUrl: string }>>;
};

let memoryCache: { at: number; manifest: PublicInstallerManifest } | null = null;
const MEMORY_TTL_MS = 30_000;

export async function buildPublicInstallerManifest(): Promise<PublicInstallerManifest> {
  const features: PublicInstallerManifest['features'] = {};
  for (const feature of ACTIVATION_FEATURES) {
    const info = await getProductInstallerInfo(feature);
    if (!info?.available) continue;
    features[feature] = {
      available: true,
      fileName: info.fileName,
      downloadUrl: `/api/public/product-installer/download?feature=${encodeURIComponent(feature)}`,
      sizeBytes: info.sizeBytes,
      ...(info.sha256 ? { sha256: info.sha256 } : {}),
    };
  }

  const pages: PublicInstallerManifest['pages'] = {};
  for (const [page, pageFeatures] of Object.entries(MARKETING_PAGE_INSTALLER_FEATURES)) {
    for (const feature of pageFeatures) {
      const row = features[feature];
      if (row) {
        pages[page] = {
          feature,
          fileName: row.fileName,
          downloadUrl: row.downloadUrl,
        };
        break;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    features,
    pages,
  };
}

export async function getPublicInstallerManifestCached(): Promise<PublicInstallerManifest> {
  const now = Date.now();
  if (memoryCache && now - memoryCache.at < MEMORY_TTL_MS) {
    return memoryCache.manifest;
  }
  const manifest = await buildPublicInstallerManifest();
  memoryCache = { at: now, manifest };
  return manifest;
}

export function invalidatePublicInstallerManifestCache(): void {
  memoryCache = null;
}

export async function refreshPublicInstallerManifestFiles(): Promise<PublicInstallerManifest> {
  invalidatePublicInstallerManifestCache();
  const manifest = await buildPublicInstallerManifest();
  const json = JSON.stringify(manifest, null, 2);
  const root = getMonorepoRoot();
  const targets = [
    path.join(root, 'data', 'product-installer-manifest.json'),
    path.join(root, 'apps', 'web', 'public', 'product-installer-manifest.json'),
  ];
  for (const file of targets) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, json, 'utf8');
  }
  memoryCache = { at: Date.now(), manifest };
  return manifest;
}
