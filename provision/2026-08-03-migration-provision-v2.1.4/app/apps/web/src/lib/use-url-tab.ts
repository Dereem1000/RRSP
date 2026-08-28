'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function useUrlTab<T extends string>(
  validTabs: readonly T[],
  defaultTab: T,
  paramName = 'tab',
): [T, (next: T) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabFromUrl = useCallback((): T => {
    const value = searchParams?.get(paramName) ?? null;
    if (value && (validTabs as readonly string[]).includes(value)) return value as T;
    return defaultTab;
  }, [searchParams, paramName, validTabs, defaultTab]);

  const [tab, setTabState] = useState<T>(() => tabFromUrl());

  useEffect(() => {
    setTabState(tabFromUrl());
  }, [tabFromUrl]);

  const setTab = useCallback(
    (next: T) => {
      setTabState(next);
      const params = new URLSearchParams(searchParams?.toString() ?? '');
      params.set(paramName, next);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams, paramName],
  );

  return [tab, setTab];
}
