import type { ApiContext, ApiHandler, ApiResult } from './types';
import { authErrorResult } from './auth';

export type RouteEntry = {
  method: string;
  pattern: string;
  handler: ApiHandler;
};

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed || trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const patternParts = normalizePath(pattern).split('/').filter(Boolean);
  const pathParts = normalizePath(path).split('/').filter(Boolean);

  const lastPattern = patternParts[patternParts.length - 1];
  const hasWildcard = Boolean(lastPattern?.startsWith(':') && lastPattern.endsWith('*'));

  if (hasWildcard) {
    const fixedLen = patternParts.length - 1;
    if (pathParts.length < fixedLen) return null;

    const params: Record<string, string> = {};
    for (let i = 0; i < fixedLen; i++) {
      const segment = patternParts[i];
      const value = pathParts[i];
      if (segment.startsWith(':')) {
        params[segment.slice(1)] = value;
        continue;
      }
      if (segment !== value) return null;
    }

    const wildKey = lastPattern.slice(1, -1);
    params[wildKey] = pathParts.slice(fixedLen).join('/');
    return params;
  }

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const segment = patternParts[i];
    const value = pathParts[i];
    if (segment.startsWith(':')) {
      params[segment.slice(1)] = value;
      continue;
    }
    if (segment !== value) return null;
  }
  return params;
}

export function createDispatcher(routes: RouteEntry[]) {
  return async (ctx: ApiContext): Promise<ApiResult> => {
    const method = ctx.method.toUpperCase();
    const path = normalizePath(ctx.path);

    for (const route of routes) {
      if (route.method.toUpperCase() !== method) continue;
      const params = matchPattern(route.pattern, path);
      if (params === null) continue;
      try {
        return await route.handler({ ...ctx, params: { ...ctx.params, ...params } });
      } catch (error) {
        return authErrorResult(error);
      }
    }

    return { status: 404, body: { success: false, message: 'Not found' } };
  };
}
