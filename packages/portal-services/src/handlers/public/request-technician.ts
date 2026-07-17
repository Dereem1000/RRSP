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

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

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

    const config = await getEmailConfig();
    const to = config.fromEmail || config.user;
    if (!config.enabled || !to) {
      return { status: 503, body: { success: false, message: 'Requests are temporarily unavailable. Please contact us directly.' } };
    }

    const rows = Object.entries(body).filter(
      ([key]) => !['captchaToken', 'turnstileToken', 'website'].includes(key)
    );

    const brand = await getEmailBrand();
    const bodyHtml = [
      paragraph('A technician service request was submitted from the public website.'),
      `<table style="width:100%;border-collapse:collapse">${rows
        .map(
          ([key, value]) =>
            `<tr><td style="padding:6px 8px;font-weight:600;vertical-align:top">${escapeHtml(key)}</td><td style="padding:6px 8px">${escapeHtml(formatValue(value))}</td></tr>`
        )
        .join('')}</table>`,
    ].join('');

    const rendered = await renderEmailLayout({
      brand,
      eyebrow: 'Service request',
      title: 'Technician service request',
      preheader: 'New public technician request',
      bodyHtml,
    });

    await sendEmail({
      to,
      subject: `Technician request — ${formatValue(body.contactName || body.name || 'Website form')}`,
      html: rendered.html,
      attachments: rendered.attachments,
    });

    return { status: 200, body: {
      success: true,
      message: 'Your request was submitted successfully. We will contact you soon.',
    } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to submit request';
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

