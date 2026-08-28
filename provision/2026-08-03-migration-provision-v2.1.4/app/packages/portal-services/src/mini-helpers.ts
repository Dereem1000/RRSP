import type { ApiResult } from '@cd-v2/api-handlers';
import { miniApiUnavailableReason } from '@web/lib/mini-dock';

export async function guardMiniApiRouteResult(): Promise<ApiResult | null> {
  const reason = await miniApiUnavailableReason();
  if (!reason) return null;
  return { status: 503, body: { success: false, error: reason } };
}
