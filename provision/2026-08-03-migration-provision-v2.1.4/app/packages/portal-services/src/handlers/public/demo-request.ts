// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { escapeHtml, getEmailBrand, paragraph, renderEmailLayout } from '@web/lib/email-templates';
import { getEmailConfig, sendEmail } from '@web/lib/email';
import { guardPublicFormFromCtx } from '../../http-helpers';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const body = ctx.body as Record<string, unknown>;
    const blocked = await guardPublicFormFromCtx(ctx, body);
    if (blocked) return blocked;

    const name = String(body.name ?? '').trim();
    const email = String(body.email ?? '').trim();
    const phone = String(body.phone ?? '').trim();
    const product = String(body.product ?? '').trim();
    const additionalInfo = String(body.additionalInfo ?? body.message ?? '').trim();

    if (!name || !email) {
      return { status: 400, body: { success: false, message: 'Name and email are required' } };
    }

    const config = await getEmailConfig();
    const to = config.fromEmail || config.user;
    if (!config.enabled || !to) {
      return { status: 503, body: { success: false, message: 'Demo requests are temporarily unavailable. Please contact us directly.' } };
    }

    const brand = await getEmailBrand();
    const bodyHtml = [
      paragraph('A new product demo was requested from the public website.'),
      `<table style="width:100%;border-collapse:collapse">${[
        ['Product', product || '—'],
        ['Name', name],
        ['Email', email],
        ['Phone', phone || '—'],
        ['Notes', additionalInfo || '—'],
      ]
        .map(
          ([label, value]) =>
            `<tr><td style="padding:6px 8px;font-weight:600;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 8px">${escapeHtml(value)}</td></tr>`
        )
        .join('')}</table>`,
    ].join('');

    const rendered = await renderEmailLayout({
      brand,
      eyebrow: 'Demo request',
      title: 'New demo request',
      preheader: `Demo request from ${name}`,
      bodyHtml,
    });

    await sendEmail({
      to,
      subject: `Demo request — ${name}`,
      html: rendered.html,
      attachments: rendered.attachments,
    });

    return { status: 200, body: {
      success: true,
      message: 'Demo request sent successfully. We will contact you within 24 hours.',
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send demo request';
    return { status: 500, body: { success: false, message } };
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

