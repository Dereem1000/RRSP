import type { ApiContext, ApiResult, TokenPayload } from '@cd-v2/api-handlers';
import { requireAdmin } from '@cd-v2/api-handlers';
import { getMiniProvisioningGateError } from '@web/lib/mini-dock';

export function requireToolboxAdmin(ctx: ApiContext): TokenPayload {
  return requireAdmin(ctx);
}

export async function requireMiniForProvisioning(): Promise<ApiResult | null> {
  const gate = await getMiniProvisioningGateError();
  if (gate) {
    return { status: 503, body: { success: false, error: gate } };
  }
  return null;
}
