import type { Request } from 'express';
import {
  getTokenFromContext,
  verifyToken,
  type ApiContext,
  type TokenPayload,
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
  const result = await dispatch(buildApiContext(req, session));
  return result;
}
