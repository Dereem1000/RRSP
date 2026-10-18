import type { ActivationFeature } from '@/lib/license-constants';

export const PRODUCT_INSTALLERS_DATA_DIR = 'product-installers';

/** Default installer location (relative to repo root). Safe for client UI placeholders. */
export function defaultInstallerRelativePath(feature: ActivationFeature): string {
  return `data\\${PRODUCT_INSTALLERS_DATA_DIR}\\${feature}.exe`;
}

/** Example folder path for UI placeholders. */
export function exampleInstallerFolderPath(feature: ActivationFeature): string {
  if (feature === 'pos' || feature === 'ecommerce') return 'E:\\POS System\\installer\\output';
  return 'E:\\Product\\installer\\output';
}
