import type { NextRequest } from 'next/server';
import { proxyToMultiServer } from '@/lib/multiserver-api-proxy';

export async function GET(req: NextRequest) {
  return proxyToMultiServer(req, '/resources.json');
}
