'use client';

import { useLayoutEffect, type ReactNode } from 'react';

/**
 * While on /rrsp/* pages, rewrite same-origin /api/* calls to /api/rrsp/*
 * so Express runs them against the shop RRSP database.
 * Parts catalog and CD billing stay on the main CD database.
 */
export function RrspFetchScope({ children }: { children: ReactNode }) {
  useLayoutEffect(() => {
    const original = window.fetch.bind(window);

    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      let url =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url;

      const isRelativeApi = url.startsWith('/api/');
      const isAbsoluteApi =
        typeof window !== 'undefined' &&
        url.startsWith(`${window.location.origin}/api/`);

      if (isRelativeApi || isAbsoluteApi) {
        const path = isAbsoluteApi ? url.slice(window.location.origin.length) : url;
        const skip =
          path.startsWith('/api/rrsp/') ||
          path.startsWith('/api/auth') ||
          path.startsWith('/api/billing') ||
          path.startsWith('/api/client-portal/billing') ||
          path.startsWith('/api/client-portal/license') ||
          path.startsWith('/api/parts') ||
          path.startsWith('/api/msp/parts') ||
          path.startsWith('/api/msp/parts-catalog') ||
          path.startsWith('/api/msp/parts-seller-payables') ||
          path.includes('/parts-catalog');
        // /api/pos rewrites to /api/rrsp/pos so shop catalog/sales hit rrsp.db

        if (!skip) {
          const rewritten = path.replace(/^\/api\//, '/api/rrsp/');
          url = isAbsoluteApi ? `${window.location.origin}${rewritten}` : rewritten;
          if (typeof input === 'string' || input instanceof URL) {
            return original(url, init);
          }
          return original(new Request(url, input), init);
        }
      }

      return original(input, init);
    };

    return () => {
      window.fetch = original;
    };
  }, []);

  return <>{children}</>;
}
