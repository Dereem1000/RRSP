import type { NextFunction, Request, Response } from 'express';
import { guardRequest, shouldSkipRequestGuard } from '@cd-v2/security';

function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]!.trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0]!.trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function requestPath(req: Request): string {
  return (req.originalUrl || req.url || req.path || '').split('?')[0] || '/';
}

function queryString(req: Request): string {
  const idx = (req.originalUrl || '').indexOf('?');
  if (idx >= 0) return (req.originalUrl || '').slice(idx + 1);
  return new URLSearchParams(
    Object.entries(req.query).flatMap(([key, value]) => {
      if (value === undefined) return [];
      if (Array.isArray(value)) return value.map((v) => [key, String(v)]);
      return [[key, String(value)]];
    }) as [string, string][]
  ).toString();
}

function bodyText(req: Request): string | null {
  const body = req.body;
  if (body == null) return null;
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (typeof body === 'object') {
    try {
      return JSON.stringify(body);
    } catch {
      return null;
    }
  }
  return String(body);
}

/**
 * Global API guard: IP block, rate limit, live Intrusion IDS, and bot detection.
 * Mount after body parsers so POST bodies are available for IDS.
 * Honeypot fields stay in route handlers (login returns 401 to avoid fingerprinting).
 */
export async function expressRequestGuard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const path = requestPath(req);
    if (shouldSkipRequestGuard(path)) {
      next();
      return;
    }

    const guard = await guardRequest({
      ip: clientIp(req),
      path,
      method: req.method,
      userAgent: req.get('user-agent'),
      acceptLanguage: req.get('accept-language'),
      query: queryString(req),
      body: bodyText(req),
    });

    if (!guard.allow) {
      const status = guard.logType === 'rate_limited' ? 429 : 403;
      res.status(status).json({ success: false, message: guard.reason ?? 'Forbidden' });
      return;
    }

    next();
  } catch (err) {
    console.error('[request-guard] failed open:', err instanceof Error ? err.message : err);
    next();
  }
}
