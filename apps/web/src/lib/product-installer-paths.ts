import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';
import type { ActivationFeature } from '@/lib/license-constants';

const ALLOWED_INSTALLER_EXT = new Set(['.exe', '.msi', '.zip']);

import { PRODUCT_INSTALLERS_DATA_DIR } from '@/lib/product-installer-shared';

export { PRODUCT_INSTALLERS_DATA_DIR } from '@/lib/product-installer-shared';

export function productInstallersDirectory(): string {
  return path.join(getMonorepoRoot(), 'data', PRODUCT_INSTALLERS_DATA_DIR);
}

export function defaultInstallerPathForFeature(feature: ActivationFeature): string {
  return path.join(productInstallersDirectory(), `${feature}.exe`);
}

function normalizeInstallerPath(raw: string): string {
  return String(raw || '').trim().replace(/\//g, '\\');
}

function hasAllowedInstallerExtension(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ALLOWED_INSTALLER_EXT.has(ext);
}

function findInstallerFilesInDirectory(dirPath: string): { fullPath: string; mtimeMs: number }[] {
  const found: { fullPath: string; mtimeMs: number }[] = [];
  if (!fs.existsSync(dirPath)) return found;
  let names: string[];
  try {
    names = fs.readdirSync(dirPath);
  } catch {
    return found;
  }
  for (const name of names) {
    const fullPath = path.join(dirPath, name);
    try {
      const st = fs.statSync(fullPath);
      if (st.isDirectory()) {
        found.push(...findInstallerFilesInDirectory(fullPath));
      } else if (st.isFile() && hasAllowedInstallerExtension(name)) {
        found.push({ fullPath, mtimeMs: st.mtimeMs });
      }
    } catch {
      /* skip unreadable entries */
    }
  }
  return found;
}

/** Pick the newest installer under a folder (recursive). */
export function pickNewestInstallerInDirectory(dirPath: string): string | null {
  const candidates = findInstallerFilesInDirectory(dirPath);
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return candidates[0].fullPath;
}

/**
 * Map configured installer path (file or folder) to the file served for download.
 */
export function resolveInstallerArtifactPath(configuredPath: string): string {
  const resolved = normalizeInstallerPath(configuredPath);
  if (!resolved) return resolved;
  if (!fs.existsSync(resolved)) return resolved;

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return pickNewestInstallerInDirectory(resolved) || resolved;
  }
  return resolved;
}

export function defaultInstallerFolderForProjectRoot(projectRoot: string): string {
  const root = normalizeInstallerPath(projectRoot).replace(/[\\/]+$/, '');
  if (!root) return '';
  return path.join(root, 'installer', 'output');
}

export function resolveConfiguredInstallerPath(
  entry: { productInstallerPath?: string; projectRoot?: string },
  feature: ActivationFeature,
): string {
  const configured = normalizeInstallerPath(entry.productInstallerPath || '');
  if (configured) return configured;
  const fromRoot = defaultInstallerFolderForProjectRoot(entry.projectRoot || '');
  if (fromRoot) return fromRoot;
  return defaultInstallerPathForFeature(feature);
}

export type ProductInstallerInfo = {
  feature: ActivationFeature;
  filePath: string;
  fileName: string;
  available: boolean;
  sizeBytes: number;
  /** Uppercase hex SHA-256 of the installer file (for AV vendor / IT verification). */
  sha256?: string;
};

function sha256HexForFile(filePath: string): string | undefined {
  try {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex').toUpperCase();
  } catch {
    return undefined;
  }
}

export function getInstallerInfoForPath(filePath: string, feature: ActivationFeature): ProductInstallerInfo | null {
  const configured = normalizeInstallerPath(filePath);
  if (!configured) return null;

  const artifactPath = resolveInstallerArtifactPath(configured);
  if (!hasAllowedInstallerExtension(artifactPath)) {
    return {
      feature,
      filePath: artifactPath,
      fileName: path.basename(artifactPath),
      available: false,
      sizeBytes: 0,
    };
  }
  if (!fs.existsSync(artifactPath)) {
    return {
      feature,
      filePath: artifactPath,
      fileName: path.basename(artifactPath),
      available: false,
      sizeBytes: 0,
    };
  }
  const stat = fs.statSync(artifactPath);
  if (!stat.isFile()) {
    return {
      feature,
      filePath: artifactPath,
      fileName: path.basename(artifactPath),
      available: false,
      sizeBytes: 0,
    };
  }
  return {
    feature,
    filePath: artifactPath,
    fileName: path.basename(artifactPath),
    available: true,
    sizeBytes: stat.size,
    sha256: sha256HexForFile(artifactPath),
  };
}

export function contentTypeForInstaller(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.msi') return 'application/octet-stream';
  if (ext === '.zip') return 'application/zip';
  return 'application/octet-stream';
}

export function readInstallerFile(filePath: string): Buffer {
  return fs.readFileSync(filePath);
}
