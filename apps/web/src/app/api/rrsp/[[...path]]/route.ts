import { createApiProxyRouteHandlers } from '@/lib/create-api-proxy-route';

export const maxDuration = 900;

/** Proxies /api/rrsp/* → Express /api/rrsp/* (RRSP DB context). */
export const { GET, POST, PUT, PATCH, DELETE } = createApiProxyRouteHandlers(['rrsp']);
