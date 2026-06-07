import { proxyToLicenseApi } from '@/lib/license-api-proxy';

export async function GET() {
  return proxyToLicenseApi('/api/license/status', { method: 'GET' });
}
