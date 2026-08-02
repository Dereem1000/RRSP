import { createApiProxyRouteHandlers } from '@/lib/create-api-proxy-route';

export const maxDuration = 900;

/** Proxies /api/pos/* → Express /api/pos/* */
export const { GET, POST, PUT, PATCH, DELETE } = createApiProxyRouteHandlers(['pos']);
