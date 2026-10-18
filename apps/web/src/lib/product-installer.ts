import {
  ACTIVATION_FEATURES,
  type ActivationFeature,
} from '@/lib/license-constants';
import { getProductConfig } from '@/lib/management-system-product-config';
import {
  getInstallerInfoForPath,
  resolveConfiguredInstallerPath,
} from '@/lib/product-installer-paths';

/** Marketing HTML pages → activation feature(s) for installer download buttons. */
export const MARKETING_PAGE_INSTALLER_FEATURES: Record<string, ActivationFeature[]> = {
  'pos-system-learn-more.html': ['pos', 'ecommerce'],
  'restaurant-management-learn-more.html': ['restaurant'],
  'document-management.html': ['document'],
  'medical-records-system.html': ['medical'],
  'auto-system.html': ['auto'],
  'distribution-system.html': ['distribution'],
  'rrms-learn-more.html': ['rrsp'],
};

export {
  PRODUCT_INSTALLERS_DATA_DIR,
  productInstallersDirectory,
  defaultInstallerPathForFeature,
  resolveConfiguredInstallerPath,
  getInstallerInfoForPath,
  contentTypeForInstaller,
  readInstallerFile,
  type ProductInstallerInfo,
} from '@/lib/product-installer-paths';

export async function getProductInstallerInfo(feature: ActivationFeature) {
  if (!ACTIVATION_FEATURES.includes(feature)) return null;
  const entry = await getProductConfig(feature);
  const filePath = resolveConfiguredInstallerPath(entry, feature);
  return getInstallerInfoForPath(filePath, feature);
}

/** First configured feature on a marketing page that has an installer file on disk. */
export async function resolveMarketingPageInstaller(pageFileName: string) {
  const features = MARKETING_PAGE_INSTALLER_FEATURES[pageFileName];
  if (!features?.length) return null;
  for (const feature of features) {
    const info = await getProductInstallerInfo(feature);
    if (info?.available) return info;
  }
  return null;
}
