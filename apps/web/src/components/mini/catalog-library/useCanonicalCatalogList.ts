'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CanonicalCatalogItem } from '@/lib/pos-catalog-canonical-display';
import {
  buildCanonicalListQuery,
  type CanonicalListFilterSettings,
} from '@/lib/pos-catalog-canonical-list-filters';

type LibraryFetch = <T>(path: string) => Promise<T>;

export function useCanonicalCatalogList(
  libraryFetch: LibraryFetch,
  listSettings: CanonicalListFilterSettings,
  debouncedQuery: string,
  refreshToken?: number | string,
  onError?: (message: string) => void,
) {
  const [listLoading, setListLoading] = useState(false);
  const [canonicalItems, setCanonicalItems] = useState<CanonicalCatalogItem[]>([]);
  const [matchedTotal, setMatchedTotal] = useState(0);
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const fetchGenerationRef = useRef(0);

  const loadCanonical = useCallback(
    async (offset = 0, append = false) => {
      if (!append) {
        fetchGenerationRef.current += 1;
      }
      const generation = fetchGenerationRef.current;
      setListLoading(true);
      try {
        const path = buildCanonicalListQuery(listSettings, debouncedQuery, offset);
        const data = await libraryFetch<{
          items?: CanonicalCatalogItem[];
          total?: number;
          matched_total?: number;
          catalog_total?: number;
          has_more?: boolean;
        }>(path);
        if (generation !== fetchGenerationRef.current) {
          return;
        }
        const items = data.items || [];
        setCanonicalItems((prev) => (append ? [...prev, ...items] : items));
        const matched = data.matched_total ?? data.total ?? items.length;
        setMatchedTotal(matched);
        if (typeof data.catalog_total === 'number') {
          setCatalogTotal(data.catalog_total);
        }
        setHasMore(Boolean(data.has_more));
      } catch (err) {
        if (generation === fetchGenerationRef.current) {
          onError?.(err instanceof Error ? err.message : 'Failed to load canonical catalog');
        }
      } finally {
        if (generation === fetchGenerationRef.current) {
          setListLoading(false);
        }
      }
    },
    [libraryFetch, debouncedQuery, listSettings, onError],
  );

  useEffect(() => {
    void loadCanonical(0, false).catch(() => {});
  }, [loadCanonical, refreshToken]);

  return {
    listLoading,
    canonicalItems,
    matchedTotal,
    catalogTotal,
    hasMore,
    loadCanonical,
  };
}
