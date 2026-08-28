// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import { ACTIVATION_FEATURES, type ActivationFeature } from '@web/lib/license-constants';
import { buildDeliverableDocument } from '@web/lib/deliverable-document';
import { buildDigitalLicense, normalizeDigitalLicense, redactDigitalLicense } from '@web/lib/digital-license';
import { getEngagement, upsertEngagement } from '@web/lib/management-system-engagements';
import { sendClientDeliverableEmail } from '@web/lib/deliverable-email';
import { licenseSerialsRevealedFromCtx } from '../../http-helpers';

function parseFeature(raw: unknown): ActivationFeature | null {
  const value = String(raw || '').trim();
  return ACTIVATION_FEATURES.includes(value as ActivationFeature) ? (value as ActivationFeature) : null;
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');
    const clientId = String(ctx.query.clientId || '').trim();
    const feature = parseFeature(ctx.query.feature);
    if (!clientId || !feature) {
      return { status: 400, body: { success: false, message: 'clientId and feature are required' } };
    }
    const engagement = await getEngagement(clientId, feature);
    const doc = await buildDeliverableDocument({
      clientId,
      feature,
      placeholders: engagement?.deliverableDraft?.placeholders,
      engagement,
    });
    const digitalLicense =
      engagement?.deliverableStatus === 'sent' && engagement?.digitalLicense
        ? normalizeDigitalLicense(engagement.digitalLicense) ??
          (await buildDigitalLicense({
            clientId,
            feature,
            placeholders: doc.placeholders,
            staffMarkdown: doc.staffMarkdown,
            issuedAt: engagement.deliverableSentAt,
          }))
        : await buildDigitalLicense({
            clientId,
            feature,
            placeholders: doc.placeholders,
            staffMarkdown: doc.staffMarkdown,
            issuedAt: engagement?.deliverableSentAt,
          });
    const revealSerials = licenseSerialsRevealedFromCtx(ctx, session.id);
    const safeLicense = redactDigitalLicense(digitalLicense, revealSerials);
    const safeEngagement = engagement
      ? {
          ...engagement,
          digitalLicense: engagement.digitalLicense
            ? redactDigitalLicense(
                normalizeDigitalLicense(engagement.digitalLicense) ?? digitalLicense,
                revealSerials,
              )
            : undefined,
        }
      : engagement;
    return {
      status: 200,
      body: {
        success: true,
        engagement: safeEngagement,
        templatePath: doc.templatePath,
        templateMarkdown: doc.templateMarkdown,
        placeholders: doc.placeholders,
        staffMarkdown: engagement?.deliverableDraft?.staffMarkdown || doc.staffMarkdown,
        clientMarkdown: doc.clientMarkdown,
        digitalLicense: safeLicense,
        serialsRevealed: revealSerials,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load deliverable';
    return { status: 500, body: { success: false, message } };
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');
    const body = ctx.body as Record<string, unknown>;
    const clientId = String(body.clientId || '').trim();
    const feature = parseFeature(body.feature);
    if (!clientId || !feature) {
      return { status: 400, body: { success: false, message: 'clientId and feature are required' } };
    }
    const placeholders = (body.placeholders || {}) as Record<string, string>;
    const doc = await buildDeliverableDocument({ clientId, feature, placeholders });
    const digitalLicense = await buildDigitalLicense({
      clientId,
      feature,
      placeholders: doc.placeholders,
      staffMarkdown: doc.staffMarkdown,
    });
    const revealSerials = licenseSerialsRevealedFromCtx(ctx, session.id);
    const engagement = await upsertEngagement({
      clientId,
      feature,
      deliverableDraft: {
        placeholders: doc.placeholders,
        staffMarkdown: doc.staffMarkdown,
      },
      deliverableClientMarkdown: doc.clientMarkdown,
      deliverableStatus: 'draft',
      digitalLicense,
    });
    return {
      status: 200,
      body: {
        success: true,
        engagement,
        digitalLicense: redactDigitalLicense(digitalLicense, revealSerials),
        serialsRevealed: revealSerials,
        ...doc,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save deliverable draft';
    return { status: 500, body: { success: false, message } };
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');
    const body = ctx.body as Record<string, unknown>;
    const action = String(body.action || 'send').trim();
    if (action !== 'send') {
      return { status: 400, body: { success: false, message: 'Unsupported action' } };
    }
    const clientId = String(body.clientId || '').trim();
    const feature = parseFeature(body.feature);
    if (!clientId || !feature) {
      return { status: 400, body: { success: false, message: 'clientId and feature are required' } };
    }
    const placeholders = (body.placeholders || {}) as Record<string, string>;
    const doc = await buildDeliverableDocument({ clientId, feature, placeholders });
    const sentAt = new Date().toISOString();
    const digitalLicense = await buildDigitalLicense({
      clientId,
      feature,
      placeholders: doc.placeholders,
      staffMarkdown: doc.staffMarkdown,
      issuedAt: sentAt,
    });
    const engagement = await upsertEngagement({
      clientId,
      feature,
      deliverableDraft: {
        placeholders: doc.placeholders,
        staffMarkdown: doc.staffMarkdown,
      },
      deliverableClientMarkdown: doc.clientMarkdown,
      deliverableStatus: 'sent',
      deliverableSentAt: sentAt,
      digitalLicense,
    });
    await sendClientDeliverableEmail({
      clientId,
      feature,
      clientMarkdown: doc.clientMarkdown,
      digitalLicense,
      sentAt,
    });
    const revealSerials = licenseSerialsRevealedFromCtx(ctx, session.id);
    return {
      status: 200,
      body: {
        success: true,
        engagement: {
          ...engagement,
          digitalLicense: redactDigitalLicense(digitalLicense, revealSerials),
        },
        digitalLicense: redactDigitalLicense(digitalLicense, revealSerials),
        serialsRevealed: revealSerials,
        sentAt,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to send deliverable';
    return { status: 500, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  if (method === 'GET') return GETHandler(ctx);
  if (method === 'PUT') return PUTHandler(ctx);
  if (method === 'POST') return POSTHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
