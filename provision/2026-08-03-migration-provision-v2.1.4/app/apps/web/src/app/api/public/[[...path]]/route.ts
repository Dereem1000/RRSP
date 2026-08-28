import { createApiProxyRouteHandlers } from '@/lib/create-api-proxy-route';

export const maxDuration = 900;

export const { GET, POST, PUT, PATCH, DELETE } = createApiProxyRouteHandlers(['public']);
