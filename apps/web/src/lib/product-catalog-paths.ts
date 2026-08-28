export const DELIVERABLE_TEMPLATE_FILENAME = 'DELIVERABLE.md';

/** Join a Windows-style product root with a relative file name. */
export function joinProductRootPath(projectRoot: string, fileName: string): string {
  const root = projectRoot.trim().replace(/[\\/]+$/, '');
  const file = fileName.trim().replace(/^[/\\]+/, '');
  if (!root) return file;
  return `${root.replace(/\//g, '\\')}\\${file.replace(/\//g, '\\')}`;
}

/** Default deliverable template location for a product root. */
export function deliverablePathForRoot(projectRoot: string): string {
  return joinProductRootPath(projectRoot, DELIVERABLE_TEMPLATE_FILENAME);
}

/**
 * Resolve deliverable template path from product root.
 * When root is set, defaults to `{root}/DELIVERABLE.md` unless a custom deliverable path was kept.
 */
export function resolveDeliverableTemplatePath(
  projectRoot: string,
  deliverableTemplatePath?: string | null,
): string {
  const root = projectRoot.trim();
  const deliverable = String(deliverableTemplatePath || '').trim();

  if (!root) return deliverable;

  const defaultPath = deliverablePathForRoot(root);
  if (!deliverable) return defaultPath;

  const deliverableNorm = deliverable.replace(/\//g, '\\');
  const fileName = deliverableNorm.split('\\').pop()?.toLowerCase() ?? '';
  if (fileName === DELIVERABLE_TEMPLATE_FILENAME.toLowerCase()) {
    return defaultPath;
  }

  return deliverable;
}

/** Infer product root from a deliverable template path when root was not supplied. */
export function inferProjectRootFromDeliverable(deliverableTemplatePath: string): string {
  const normalized = deliverableTemplatePath.trim().replace(/\//g, '\\');
  if (!normalized) return '';
  const idx = normalized.lastIndexOf('\\');
  return idx > 0 ? normalized.slice(0, idx) : '';
}
