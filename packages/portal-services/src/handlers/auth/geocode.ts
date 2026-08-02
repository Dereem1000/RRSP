// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { geocodeAddressDetailed } from '@web/lib/parts-routing';

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    requireSession(ctx);
    const body = ctx.body as Record<string, unknown>;
    const address = String(body.address ?? '').trim();
    if (!address) {
      return { status: 400, body: { success: false, message: 'Address is required' } };
    }

    const hit = await geocodeAddressDetailed(address, null);
    if (!hit) {
      return {
        status: 200,
        body: {
          success: true,
          found: false,
          message: 'Address could not be resolved — drop a pin on the map',
          latitude: null,
          longitude: null,
          precision: null,
          cityLabel: null,
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        found: true,
        latitude: hit.coords.lat,
        longitude: hit.coords.lon,
        precision: hit.precision,
        cityLabel: hit.cityLabel,
        approximate: hit.precision === 'city',
        message:
          hit.precision === 'city'
            ? 'Exact address not found — showing nearest city. Drop a pin to set the exact spot.'
            : 'Address located on the map',
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Geocode failed';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
