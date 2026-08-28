import type { Request } from 'express';
import {
  getTokenFromContext,
  verifyToken,
  type ApiContext,
} from '@cd-v2/api-handlers';

function buildFormDataFromRequest(req: Request): FormData | undefined {
  const files = req.files as Express.Multer.File[] | undefined;
  const hasFields = req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0;
  if (!files?.length && !hasFields) return undefined;

  const formData = new FormData();
  if (hasFields) {
    for (const [key, value] of Object.entries(req.body as Record<string, unknown>)) {
      if (value === undefined || value === null) continue;
      formData.append(key, String(value));
    }
  }
  if (files?.length) {
    for (const file of files) {
      const blob = new File([new Uint8Array(file.buffer)], file.originalname, { type: file.mimetype });
      formData.append(file.fieldname, blob);
    }
  }
  return formData;
}

export function buildApiContext(req: Request, session: TokenPayload | null = null): ApiContext {
  const query: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(req.query)) {
    if (value === undefined) continue;
    query[key] = Array.isArray(value) ? value.map(String) : String(value);
  }

  const urlPath = req.originalUrl.split('?')[0] || req.path;
  const parsedCookies = req.cookies as Record<string, string> | undefined;

  return {
    method: req.method,
    path: req.path,
    urlPath,
    params: Object.fromEntries(
      Object.entries(req.params).map(([key, value]) => [key, String(value)])
    ),
    query,
    body: req.body,
    session,
    formData: buildFormDataFromRequest(req),
    cookies: parsedCookies,
    header(name: string) {
      const value = req.get(name);
      return value ?? undefined;
    },
  };
}

export function applyApiResult(res: import('express').Response, result: import('@cd-v2/api-handlers').ApiResult) {
  if (!result || typeof result.status !== 'number') {
    res.status(500).json({ success: false, message: 'Handler returned an invalid response' });
    return;
  }
  if (result.cookies?.length) {
    for (const cookie of result.cookies) {
      res.cookie(cookie.name, cookie.value, {
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
        path: cookie.path,
        maxAge: cookie.maxAge,
      });
    }
  }
  if (result.headers) {
    for (const [key, value] of Object.entries(result.headers)) {
      res.setHeader(key, value);
    }
  }
  if (result.rawBody !== undefined) {
    res.status(result.status).send(result.rawBody);
    return;
  }
  res.status(result.status).json(result.body);
}

export async function runDispatcher(
  req: Request,
  dispatch: (ctx: ApiContext) => Promise<import('@cd-v2/api-handlers').ApiResult>
) {
  const token = getTokenFromContext(buildApiContext(req));
  const session = token ? verifyToken(token) : null;
  let ctx = buildApiContext(req, session);

  const rawUrl = ctx.urlPath || req.originalUrl || req.path || '';
  const isRrspApi =
    rawUrl.includes('/api/rrsp/') ||
    ctx.path === '/rrsp' ||
    ctx.path.startsWith('/rrsp/');

  if (isRrspApi) {
    const strippedPath = ctx.path.replace(/^\/rrsp(?=\/|$)/, '') || '/';
    const strippedUrl = rawUrl.replace('/api/rrsp/', '/api/').replace('/rrsp/', '/');
    ctx = {
      ...ctx,
      path: strippedPath.startsWith('/') ? strippedPath : `/${strippedPath}`,
      urlPath: strippedUrl,
    };
  }

  if (isRrspApi && session) {
    const { getClientRrspAccess } = await import('@web/lib/rrsp-access');
    const { isRrspModuleApiPath, isCdOnlyApiPath, runWithRrspDb } = await import('@web/lib/rrsp-db');

    const modulePath =
      isRrspModuleApiPath(ctx.urlPath) || isRrspModuleApiPath(ctx.path);
    const cdOnly = isCdOnlyApiPath(ctx.urlPath) || isCdOnlyApiPath(ctx.path);

    // Parts/auth/billing stay on CD even when proxied under /api/rrsp/*
    if (!modulePath || cdOnly) {
      // Accounting under /api/rrsp must never hit CD — refuse rather than leak.
      const { isRrspAccountingApiPath } = await import('@web/lib/rrsp-db');
      if (isRrspAccountingApiPath(ctx.urlPath) || isRrspAccountingApiPath(ctx.path)) {
        return {
          status: 403,
          body: { success: false, message: 'Shop accounting requires an RRSP shop database context' },
        };
      }
      return dispatch(ctx);
    }

    if (session.role === 'client') {
      const access = await getClientRrspAccess(session.id);
      if (access.enabled && access.mspClientId) {
        return runWithRrspDb(access.mspClientId, () => dispatch(ctx));
      }
      return {
        status: 403,
        body: { success: false, message: 'RRSP license required' },
      };
    }

    // Staff should not read shop DBs via /api/rrsp in this phase.
    return {
      status: 403,
      body: {
        success: false,
        message: 'Shop modules via /api/rrsp are only available to RRSP client users',
      },
    };
  }

  // Client Shop POS may hit /api/pos (or miss dispatcher wrap). Attach RRSP DB when licensed.
  if (session?.role === 'client') {
    const { isRrspDbActive, runWithRrspDb } = await import('@web/lib/rrsp-db');
    const pathHint = `${ctx.path} ${ctx.urlPath || ''} ${rawUrl}`;
    if (!isRrspDbActive() && pathHint.includes('/pos')) {
      const { getClientRrspAccess } = await import('@web/lib/rrsp-access');
      const access = await getClientRrspAccess(session.id);
      if (access.enabled && access.mspClientId) {
        return runWithRrspDb(access.mspClientId, () => dispatch(ctx));
      }
    }
  }

  return dispatch(ctx);
}
