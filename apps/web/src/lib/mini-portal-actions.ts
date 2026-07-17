import type { MiniCdIndex } from '@/lib/mini-cd-index';
import { findIndexEntryByHref } from '@/lib/mini-cd-index';

export type MiniPortalNavigateAction = {
  type: 'navigate';
  href: string;
  label?: string;
};

export type MiniPortalAction = MiniPortalNavigateAction;

const SETTINGS_TABS = ['system', 'email', 'company', 'users', 'security', 'integrations', 'backup'] as const;

function validateIndexedHref(href: string, index?: MiniCdIndex): CdIndexEntryMatch | null {
  if (!index) return null;
  const entry = findIndexEntryByHref(index, href);
  if (!entry) return null;
  return { href: entry.href, label: entry.label };
}

type CdIndexEntryMatch = { href: string; label: string };

export function sanitizePortalAction(
  action: unknown,
  allowedPages: Array<{ href: string; label: string }>,
  index?: MiniCdIndex
): MiniPortalAction | null {
  if (!action || typeof action !== 'object') return null;
  const candidate = action as Record<string, unknown>;
  if (candidate.type !== 'navigate') return null;

  const rawHref = String(candidate.href ?? '').trim();
  if (!rawHref.startsWith('/')) return null;

  const indexed = validateIndexedHref(rawHref, index);
  if (indexed) {
    return {
      type: 'navigate',
      href: indexed.href,
      label: String(candidate.label || indexed.label),
    };
  }

  const [pathname, query = ''] = rawHref.split('?');

  if (pathname === '/settings' && query) {
    const tab = new URLSearchParams(query).get('tab');
    if (!tab || !SETTINGS_TABS.includes(tab as (typeof SETTINGS_TABS)[number])) {
      return null;
    }
    const allowed = allowedPages.find((page) => page.href === pathname);
    if (!allowed) return null;
    return {
      type: 'navigate',
      href: `/settings?tab=${tab}`,
      label: String(candidate.label || `${allowed.label} · ${tab}`),
    };
  }

  const allowed = allowedPages.find((page) => page.href === pathname);
  if (!allowed) return null;
  if (query) return null;

  return {
    type: 'navigate',
    href: allowed.href,
    label: String(candidate.label || allowed.label),
  };
}
