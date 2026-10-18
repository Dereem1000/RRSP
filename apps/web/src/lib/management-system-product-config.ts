import { SystemConfig } from '@cd-v2/database';
import { ACTIVATION_FEATURES, type ActivationFeature } from '@/lib/license-constants';
import {
  inferProjectRootFromDeliverable,
  resolveDeliverableTemplatePath,
} from '@/lib/product-catalog-paths';
import { getInstallerInfoForPath, resolveConfiguredInstallerPath } from '@/lib/product-installer-paths';

export {
  DELIVERABLE_TEMPLATE_FILENAME,
  deliverablePathForRoot,
  joinProductRootPath,
  resolveDeliverableTemplatePath,
} from '@/lib/product-catalog-paths';

export const CONFIG_KEY_PRODUCT_CATALOG = 'management_system_product_catalog';
export const CONFIG_CATEGORY = 'management_systems';

export type ProductCatalogEntry = {
  projectRoot: string;
  deliverableTemplatePath: string;
  /** Absolute path to installer (.exe, .msi, .zip) or empty to use data/product-installers/{feature}.exe */
  productInstallerPath?: string;
  systemKey?: string;
  /** Populated on read — true when the resolved installer file exists on disk */
  installerAvailable?: boolean;
  /** Populated on read — basename of the resolved installer file when available */
  installerResolvedFile?: string;
};

export type ProductCatalog = Partial<Record<ActivationFeature, ProductCatalogEntry>>;

const DEFAULT_CATALOG: ProductCatalog = {
  pos: {
    projectRoot: 'E:\\POS System',
    deliverableTemplatePath: 'E:\\POS System\\DELIVERABLE.md',
    systemKey: 'pos',
  },
  auto: {
    projectRoot: 'E:\\AutoM.System',
    deliverableTemplatePath: 'E:\\AutoM.System\\DELIVERABLE.md',
    systemKey: 'autom',
  },
  crm: {
    projectRoot: 'E:\\CRM',
    deliverableTemplatePath: 'E:\\CRM\\DELIVERABLE.md',
    systemKey: 'crm',
  },
  restaurant: {
    projectRoot: 'E:\\Restaurant System',
    deliverableTemplatePath: 'E:\\Restaurant System\\DELIVERABLE.md',
    systemKey: 'restaurant',
  },
  document: {
    projectRoot: 'E:\\LawFirm System',
    deliverableTemplatePath: 'E:\\LawFirm System\\DELIVERABLE.md',
    systemKey: 'lawfirm',
  },
};

function normalizeCatalogEntry(
  row: ProductCatalogEntry,
  feature: ActivationFeature,
): ProductCatalogEntry | null {
  let projectRoot = String(row.projectRoot || '').trim();
  let deliverableTemplatePath = String(row.deliverableTemplatePath || '').trim();

  if (projectRoot) {
    deliverableTemplatePath = resolveDeliverableTemplatePath(projectRoot, deliverableTemplatePath);
  } else if (deliverableTemplatePath) {
    projectRoot = inferProjectRootFromDeliverable(deliverableTemplatePath);
  }

  const productInstallerPath = String(row.productInstallerPath || '').trim();

  if (!projectRoot && !deliverableTemplatePath && !productInstallerPath) return null;

  const entry: ProductCatalogEntry = {
    projectRoot,
    deliverableTemplatePath: projectRoot
      ? resolveDeliverableTemplatePath(projectRoot, deliverableTemplatePath)
      : deliverableTemplatePath,
    productInstallerPath,
    systemKey: String(row.systemKey || feature).trim() || feature,
  };

  const installerPath = resolveConfiguredInstallerPath(entry, feature);
  const installerInfo = getInstallerInfoForPath(installerPath, feature);
  entry.installerAvailable = Boolean(installerInfo?.available);
  if (installerInfo?.available) {
    entry.installerResolvedFile = installerInfo.fileName;
  }

  return entry;
}

function mergeCatalog(stored: ProductCatalog | null): ProductCatalog {
  const merged: ProductCatalog = { ...DEFAULT_CATALOG };
  if (stored && typeof stored === 'object') {
    for (const feature of ACTIVATION_FEATURES) {
      const row = stored[feature];
      if (!row) continue;
      const normalized = normalizeCatalogEntry(
        {
          projectRoot: String(row.projectRoot || merged[feature]?.projectRoot || '').trim(),
          deliverableTemplatePath: String(
            row.deliverableTemplatePath || merged[feature]?.deliverableTemplatePath || '',
          ).trim(),
          productInstallerPath: String(
            row.productInstallerPath || merged[feature]?.productInstallerPath || '',
          ).trim(),
          systemKey: String(row.systemKey || merged[feature]?.systemKey || feature).trim() || feature,
        },
        feature,
      );
      if (normalized) merged[feature] = normalized;
    }
  }
  return merged;
}

export async function getProductCatalog(): Promise<ProductCatalog> {
  const stored = await SystemConfig.getConfig<ProductCatalog>(CONFIG_KEY_PRODUCT_CATALOG, null);
  return mergeCatalog(stored);
}

export async function getProductConfig(feature: ActivationFeature): Promise<ProductCatalogEntry> {
  const catalog = await getProductCatalog();
  return (
    catalog[feature] ?? {
      projectRoot: '',
      deliverableTemplatePath: '',
      productInstallerPath: '',
      systemKey: feature,
    }
  );
}

export async function saveProductCatalog(catalog: ProductCatalog): Promise<ProductCatalog> {
  const normalized: ProductCatalog = {};
  for (const feature of ACTIVATION_FEATURES) {
    const row = catalog[feature];
    if (!row) continue;
    const entry = normalizeCatalogEntry(row, feature);
    if (entry) {
      const {
        installerAvailable: _installerAvailable,
        installerResolvedFile: _installerResolvedFile,
        ...toSave
      } = entry;
      normalized[feature] = toSave;
    }
  }
  await SystemConfig.setConfig(CONFIG_KEY_PRODUCT_CATALOG, normalized, 'json', CONFIG_CATEGORY);
  return mergeCatalog(normalized);
}
