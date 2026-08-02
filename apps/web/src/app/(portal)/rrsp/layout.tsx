import type { ReactNode } from 'react';
import { RrspFetchScope } from '@/components/rrsp/RrspFetchScope';

export default function RrspLayout({ children }: { children: ReactNode }) {
  return <RrspFetchScope>{children}</RrspFetchScope>;
}
