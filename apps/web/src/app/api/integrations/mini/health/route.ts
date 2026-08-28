import type { NextRequest } from 'next/server';
import { proxyToMultiServer } from '@/lib/multiserver-api-proxy';

export const maxDuration = 900;

/** Explicit health route — avoids optional-catch-all conflicts with api/[[...path]]. */
export async function GET(req: NextRequest) {
  return proxyToMultiServer(req, '/api/integrations/mini/health');
}
