import type { NextRequest } from 'next/server';
import { proxyToMultiServer } from '@/lib/multiserver-api-proxy';

export const maxDuration = 900;

export async function POST(req: NextRequest) {
  return proxyToMultiServer(req, '/api/integrations/mini/integration-kit/apply-update');
}
